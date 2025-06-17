const mockPrisma = {
    user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        deleteMany: jest.fn(),
        findMany: jest.fn(),
    },
    token: {
        findFirst: jest.fn(),
        create: jest.fn(),
        deleteMany: jest.fn(),
    },
    cart: {
        findUnique: jest.fn(),
        create: jest.fn(),
        deleteMany: jest.fn(),
    },
    computer: {
        findUnique: jest.fn(),
        create: jest.fn(),
        deleteMany: jest.fn(),
    },
    room: {
        findUnique: jest.fn(),
        create: jest.fn(),
        deleteMany: jest.fn(),
    },
};

module.exports = {
    prisma: mockPrisma,
};
