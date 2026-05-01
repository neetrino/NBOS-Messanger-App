const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'demo1234';

const demoUsers = [
  { email: 'alice@demo.local', name: 'Alice' },
  { email: 'bob@demo.local', name: 'Bob' },
  { email: 'caro@demo.local', name: 'Caro' },
];

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const users = [];
  for (const u of demoUsers) {
    const row = await prisma.user.upsert({
      where: { email: u.email },
      create: {
        email: u.email,
        name: u.name,
        password: passwordHash,
      },
      update: {
        name: u.name,
        password: passwordHash,
      },
    });
    users.push(row);
  }

  const [alice, bob, caro] = users;
  const memberIds = [alice.id, bob.id, caro.id];

  await prisma.conversation.deleteMany({ where: { title: 'Demo chat' } });

  const conversation = await prisma.conversation.create({
    data: {
      title: 'Demo chat',
      members: {
        create: memberIds.map((userId) => ({ userId })),
      },
    },
  });

  await prisma.message.createMany({
    data: [
      {
        conversationId: conversation.id,
        senderId: alice.id,
        body: 'Ողջույն, սա demo chat է — Alice',
      },
      {
        conversationId: conversation.id,
        senderId: bob.id,
        body: 'Hi from Bob 👋',
      },
      {
        conversationId: conversation.id,
        senderId: caro.id,
        body: 'Caro is here too.',
      },
    ],
  });

  // eslint-disable-next-line no-console
  console.log('Seed OK:', {
    users: demoUsers.map((u) => u.email),
    password: DEMO_PASSWORD,
    conversationId: conversation.id,
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    void prisma.$disconnect();
    process.exit(1);
  });
