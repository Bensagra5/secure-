import bcryptjs from 'bcryptjs';

import { prisma } from "../client.js";
import { token } from 'morgan';

const status = {
  inProcess: "En proceso",
  withdrawn: "Retirada",
  returned: "Devuelta",
  missing: "Faltante",
  inReturnProcess: "En proceso devolucion"
};


const rooms = async (req, res) => {
  res.header("Access-Control-Allow-Origin", "*");

  try {
    const roomsWithAvailableSlots = await prisma.cart.findMany({
      include: {
        room: true,
        computers: true
      },

      orderBy: {
        room: {
          roomNumber: "asc"
        }
      }
    });
    const filteredCarts = roomsWithAvailableSlots.filter(cart => cart.computers.length > 0);

    res.status(200).json(filteredCarts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getRoomsWithAvailableSlots = async (req, res) => {
  try {
    // Buscar todos los carts con sus respectivas rooms y computadoras
    const carts = await prisma.cart.findMany({
      include: {
        room: true,      // Incluye la relación con Room
        computers: true, // Incluye las computadoras relacionadas
      },
      orderBy: {
        room: {
          roomNumber: "asc", // Ordena por el número de Room en orden ascendente
        },
      },
    });

    // Filtrar los carts que tienen menos computadoras que slots disponibles
    const filteredCarts = carts.filter(cart => cart.computers.length < cart.slots);

    // Devolver la respuesta con la misma estructura que el primer método
    res.status(200).json(filteredCarts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};


const retirada = async (req, res) => {
  res.header("Access-Control-Allow-Origin", "*");
  const token = req.body.token;
  console.log(token)
  try {
    let findToken = await prisma.token.findFirst({
      where: {
        id: token,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    console.log(findToken);

    if (
      !findToken ||  // Aseguramos que findToken existe antes de acceder a su status
      findToken.status === status.returned ||
      findToken.status === status.withdrawn ||
      findToken.status === status.transferida
    ) {
      return res.status(200).json({ verificado: true });
    } else {
      return res.status(401).json({ verificado: false });
    }

  } catch (error) {
    return res.status(500).json({ error });
  }
};


const transaccionesPasadas = async (req, res) => {

  res.header("Access-Control-Allow-Origin", "*");

  try {
    const userId = req.body.userId;
    console.log(userId)
    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const transactions = await prisma.token.findMany({
      where: {
        userId: parseInt(userId),  // Asegúrate de que userId sea un número
      },
      include: {
        computers: true,
        user: true,
        cart: {
          include: {
            room: true
          }
        }
      },
    });

    res.status(200).json(transactions);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }

}
export const gettersControllers = {
  getRoomsWithAvailableSlots,
  rooms,
  retirada,
  transaccionesPasadas
}


