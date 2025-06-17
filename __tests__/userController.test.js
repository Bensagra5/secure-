import { prisma } from '../client.js'; // Asegúrate de que la ruta sea correcta
import request from 'supertest';
import app from '../script'; // Asegúrate de que la ruta sea correcta

jest.mock('../client.js'); // Usar el mock de prisma

describe('User API', () => {
    beforeEach(() => {
        jest.clearAllMocks(); // Limpia los mocks antes de cada prueba
    });

    it('should register a new user', async () => {
        const newUser = { id: 1, occupation: 'Estudiante', username: 'testuser', avatar: 'testavatar' };

        // Mockear la creación de usuario
        prisma.user.create.mockResolvedValue(newUser);

        const response = await request(app)
            .post('/users/register') // Reemplaza con tu ruta
            .send({
                username: 'testuser',
                password: 'testpassword',
                occupation: 'Estudiante',
                avatar: 'testavatar',
            });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('id', newUser.id);
        expect(response.body.occupation).toBe('Estudiante');
        expect(prisma.user.create).toHaveBeenCalledWith(expect.objectContaining({
            data: {
                username: 'testuser',
                password: 'testpassword',
                occupation: 'Estudiante',
                avatar: 'testavatar',
            },
        }));
    });
});
