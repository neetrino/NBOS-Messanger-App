import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  validateChatAttachmentMeta,
  type AttachmentKind,
  type MessageAttachmentDto,
} from '@app-messenger/shared';
import { createReadStream, existsSync, mkdirSync } from 'node:fs';
import { rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import { ConversationsService } from '../conversations/conversations.service';
import { PrismaService } from '../prisma/prisma.service';

const UPLOAD_SUBDIR = 'chat';

@Injectable()
export class ChatFilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ConversationsService,
  ) {}

  uploadsDir(): string {
    return join(process.cwd(), 'uploads', UPLOAD_SUBDIR);
  }

  ensureUploadsDir(): void {
    const dir = this.uploadsDir();
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  absolutePathFor(storageFileName: string): string {
    return join(this.uploadsDir(), storageFileName);
  }

  async detectMimeType(filePath: string): Promise<string | undefined> {
    const { fileTypeFromFile } = await import('file-type');
    const r = await fileTypeFromFile(filePath);
    return r?.mime;
  }

  async saveUploadedFile(params: {
    userId: string;
    conversationId: string;
    diskPath: string;
    originalName: string;
    reportedSize: number;
  }): Promise<MessageAttachmentDto> {
    await this.conversations.assertMember(params.userId, params.conversationId);
    const rawDetected = await this.detectMimeType(params.diskPath);
    const detected = resolveDetectedMime(rawDetected, params.originalName);
    if (!detected) {
      await unlink(params.diskPath).catch(() => undefined);
      throw new BadRequestException('Unsupported file type');
    }
    const v = validateChatAttachmentMeta({
      mimeType: detected,
      sizeBytes: params.reportedSize,
    });
    if (!v.ok) {
      await unlink(params.diskPath).catch(() => undefined);
      if (v.code === 'file-too-large') {
        throw new BadRequestException('File is too large');
      }
      throw new BadRequestException('Unsupported file type');
    }
    const id = randomUUID();
    const finalPath = this.absolutePathFor(id);
    await rename(params.diskPath, finalPath).catch(async () => {
      await unlink(params.diskPath).catch(() => undefined);
      throw new BadRequestException('Failed to store file');
    });
    const row = await this.prisma.chatFile.create({
      data: {
        id,
        conversationId: params.conversationId,
        uploadedByUserId: params.userId,
        storageFileName: id,
        originalName: sanitizeOriginalName(params.originalName),
        mimeType: detected,
        sizeBytes: params.reportedSize,
        kind: v.kind,
      },
    });
    return {
      fileId: row.id,
      kind: row.kind as AttachmentKind,
      originalName: row.originalName,
      mimeType: row.mimeType,
      size: row.sizeBytes,
    };
  }

  async streamToResponse(params: {
    userId: string;
    fileId: string;
    res: Response;
  }): Promise<void> {
    const file = await this.prisma.chatFile.findUnique({
      where: { id: params.fileId },
    });
    if (!file) {
      throw new NotFoundException('File not found');
    }
    await this.conversations.assertMember(params.userId, file.conversationId);
    const path = this.absolutePathFor(file.storageFileName);
    if (!existsSync(path)) {
      throw new NotFoundException('File not found');
    }
    params.res.setHeader('Content-Type', file.mimeType);
    params.res.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeRFC5987(file.originalName)}`,
    );
    createReadStream(path).pipe(params.res);
  }
}

function resolveDetectedMime(
  detected: string | undefined,
  originalName: string,
): string | undefined {
  const zipOffice = refineZipOfficeFamily(detected, originalName);
  if (zipOffice) {
    return zipOffice;
  }
  if (detected) {
    return detected;
  }
  const n = originalName.toLowerCase();
  if (n.endsWith('.txt')) {
    return 'text/plain';
  }
  return undefined;
}

function refineZipOfficeFamily(
  detected: string | undefined,
  originalName: string,
): string | undefined {
  if (
    detected !== 'application/zip' &&
    detected !== 'application/x-zip-compressed'
  ) {
    return undefined;
  }
  const n = originalName.toLowerCase();
  if (n.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (n.endsWith('.xlsx')) {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }
  if (n.endsWith('.pptx')) {
    return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  }
  if (n.endsWith('.zip')) {
    return 'application/zip';
  }
  return undefined;
}

function sanitizeOriginalName(name: string): string {
  const base = name.replace(/[/\\]/g, '_').slice(0, 240);
  return base.length > 0 ? base : 'attachment';
}

function encodeRFC5987(name: string): string {
  return encodeURIComponent(name).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}
