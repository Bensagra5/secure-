import { prisma } from '../client.js';
import CryptoJS from 'crypto-js';
import { token } from 'morgan';
import { randomUUID } from 'crypto';
import { professorControllers } from './professor_controllers.js';



const status = {
  inProcess: "En proceso",
  withdrawn: "Retirada",
  returned: "Devuelta",
  missing: "Faltante",
  inReturnProcess: "En proceso devolucion",
  transferida: "Transferida por un profesor"
};

const requestComputer = async (req, res) => {
  res.header("Access-Control-Allow-Origin", "*");
  let userId = 0
  if (req.body.token === "") {
    let user = await prisma.user.findUnique({
      where: {
        nfc: req.body.rfid
      }
    })
    userId = user.id

  } else {
    userId = req.body.userId
  }
  const cartId = parseInt(req.body.cartId);
  let user = await prisma.user.findUnique({
    where: {
      id: parseInt(userId)
    }
  })

  console.log(userId)
  try {

    console.log(user)
    if (user.occupation === "Profesor") {

      let professorLastToken = await prisma.token.findFirst({
        where: { userId: parseInt(userId) },
        orderBy: { createdAt: 'desc' },
      });
      if (professorLastToken && professorLastToken.status === status.inProcess) {
        return res.status(403).json("El usuario no tiene permitido el retiro de computadoras");
      }



      // Buscar las computadoras asociadas al carrito
      const computers = await prisma.computer.findMany({
        where: { cartId: cartId }, include: {
          cart: true
        }
      });
      if (!computers.length) {
        return res.status(404).json({ error: "No hay computadoras disponibles." });
      }

      // Recoger los slots de las computadoras
      // Crear un array de slots ocupados
      const slots = Array(4).fill(0); // Aquí suponemos que hay 2 slots por defecto (puedes ajustar según sea necesario)

      // Asignar los slots correspondientes
      computers.forEach((c) => {
        if (c.slot != null) { // Verificar que el slot no sea null
          slots[c.slot - 1] = 1; // Marcamos el slot como ocupado
        }
      });
      let computadoras = []
      for (let index = 0; index < computers.length; index++) {
        const element = computers[index];
        computadoras.push(element.id)

      }

      // Crear los datos del token
      const tokenData = { userId: parseInt(userId), cartId: cartId, status: status.inProcess, createdAt: new Date(), slots: slots, computers: computadoras };
      console.log(tokenData)
      // Encriptar el token
      const createToken = CryptoJS.AES.encrypt(
        JSON.stringify(tokenData),
        process.env.SECRET_KEY || "default_secret_key"
      ).toString();

      // Guardar el token en la base de datos
      const token = await prisma.token.create({
        data: {
          id: createToken, // Guardar el token encriptado
          userId: parseInt(userId),
          cartId: cartId,
          status: status.inProcess,
          createdAt: tokenData.createdAt,
        },
      });

      // Asociar las computadoras al token
      await prisma.computerToken.createMany({
        data: computers.map(c => ({ computerId: c.id, tokenId: token.id, slot: c.slot })),
      });


      if (req.body.token === "") {
        return { tokenId: token.id, slots: computers.map(c => c.slot) };

      } else {
        return res.status(200).json({ tokenId: token.id, slots: computers.map(c => c.slot) });
      }



    } else if (user.occupation === "Estudiante") {
      const lastUserToken = await prisma.token.findFirst({
        where: { userId: parseInt(userId) },
        orderBy: { createdAt: 'desc' },
      });

      if (lastUserToken && lastUserToken.status !== status.returned) {
        return res.status(403).json("El usuario no tiene permitido el retiro de computadoras");
      }

      // Iniciar una transacción para evitar conflictos de concurrencia
      const result = await prisma.$transaction(async (prisma) => {
        // Busca las computadoras disponibles en el carrito especificado
        const computers = await prisma.computer.findMany({
          where: {
            cartId: cartId,
          },
        });

        if (!computers.length) {
          throw new Error("No hay computadoras en el carrito especificado.");
        }

        const now = new Date();
        const selectedComputer = await Promise.all(computers.map(async (computer) => {
          const checkInTime = new Date(computer.checkInTime);
          const hourDifference = (now.getTime() - checkInTime.getTime()) / (1000 * 60 * 60);

          let token = await prisma.token.findFirst({
            where: {
              computers: {
                some: {
                  computerId: computer.id
                }
              },
              status: status.inProcess,
            },
            orderBy: { createdAt: 'desc' },
          });

          if (hourDifference >= 0 && !token) {
            return computer; // Devuelve la computadora si cumple los criterios
          }
          return null; // Devuelve null si no cumple los criterios
        }));

        // Filtrar computadoras válidas
        const validComputers = selectedComputer.filter(comp => comp !== null);
        if (validComputers.length === 0) {
          throw new Error("No hay computadoras disponibles.");
        }

        // Selecciona la primera computadora válida
        const selected = validComputers[0];

        // Crear el token con la relación de ComputerToken
        let userToken = {
          userId: parseInt(userId),
          cartId: cartId,
          computerId: selected.id,
          slots: [selected.slot],
          status: status.inProcess,
          createdAt: now
        };

        const createToken = CryptoJS.AES.encrypt(
          JSON.stringify(userToken),
          "42voxlY%z£u|65399(4:R.V1%H%VarK3"
        ).toString();

        // Crear el token y asociarlo a la computadora
        const token = await prisma.token.create({
          data: {
            id: createToken,
            userId: userToken.userId,
            cartId: userToken.cartId,
            status: userToken.status,
            createdAt: userToken.createdAt,
            computers: {
              create: {
                computerId: userToken.computerId,
                slot: userToken.slots[0],
              },
            },
          },
        });

        // Actualizar la computadora para marcarla como ocupada


        if (req.body.token === "") {
          return { tokenId: token.id, slots: selected.slot };

        } else {
          return res.status(200).json({ tokenId: token.id, slots: selected.slot });
        }
      });

      // Devolver el resultado

      if (req.body.token === "") {
        return result

      } else {
        return res.status(200).json(result);
      }

    }

  } catch (error) {
    console.error("Error en requestComputer:", error); // Agrega un log de error
    return res.status(500).json({ error: error.message });
  }
};


const withdrawComputer = async (req, res) => {
  res.header("Access-Control-Allow-Origin", "*");
  let userId = 0
  let tokenData = ""
  let lastToken
  let dataToken
  let decryptedToken;
  if (req.body.token === "") {
    try {
      let user = await prisma.user.findUnique({
        where: {
          nfc: req.body.rfid
        }
      })
      dataToken = {
        status: "none"
      }
      userId = user.id
      let response = await requestComputer(req, res)
      tokenData = response.tokenId
      decryptedToken = JSON.parse(
        CryptoJS.AES.decrypt(
          tokenData,
          "42voxlY%z£u|65399(4:R.V1%H%VarK3"
        ).toString(CryptoJS.enc.Utf8)
      );


      console.log(decryptedToken, tokenData)
    } catch (error) {


      return res.status(200).json(await professorControllers.returnWithRfid(req, res));
    }






  } else {
    decryptedToken = JSON.parse(
      CryptoJS.AES.decrypt(
        req.body.token,
        "42voxlY%z£u|65399(4:R.V1%H%VarK3"
      ).toString(CryptoJS.enc.Utf8)
    );
    tokenData = req.body.token
    console.log(decryptedToken, tokenData)
  }

  try {
    // Desencriptar el token


    let statusFromToken = decryptedToken.status;

    // 1. Proceso para cuando el estado del token es "inProcess"
    if (statusFromToken === status.inProcess && decryptedToken.slots.length === 1) {
      // Buscar si el token existe con el estado correcto
      const token = await prisma.token.findFirst({
        where: {
          id: tokenData,
          status: { not: status.withdrawn, },
        },
      });

      if (!token) {
        return res.status(404).json({ error: "Token not found or already withdrawn" });
      }

      // Actualizar el estado del token a "withdrawn"
      await prisma.token.update({
        where: { id: tokenData },
        data: { status: status.withdrawn },
      });

      // Actualizar las computadoras relacionadas con el token
      await prisma.computer.updateMany({
        where: {
          tokens: {
            some: {
              tokenId: tokenData,
            },
          },
        },
        data: { cartId: null, checkOutTime: new Date(), slot: null },
      });


      return res.status(200).json({ type: "unico", slots: decryptedToken.slots });
    }
    // 2. Proceso para cuando el estado del token es "inReturnProcess"
    else if (statusFromToken === status.inReturnProcess) {

      // Buscar el token con estado "inReturnProcess"
      const token = await prisma.token.findFirst({
        where: {
          id: req.body.token,
          cartId: parseInt(req.body.cartId),
          status: status.inReturnProcess,
        },
      });

      if (!token) {
        return res.status(404).json({ error: "Token not found or not in return process" });
      }

      // Actualizar el estado del token a "returned"
      await prisma.token.update({
        where: { id: token.id },
        data: { status: status.returned },
      });

      // Actualizar las computadoras relacionadas con el token
      await prisma.computer.updateMany({
        where: {
          tokens: {
            some: {
              tokenId: token.id,
            },
          },
        },
        data: {
          cartId: parseInt(req.body.cartId),
          slot: decryptedToken.slot,
          checkInTime: new Date(),
        },
      });
      return res.status(200).json({ type: "unico", slots: [decryptedToken.slot] });
    } else if (statusFromToken === status.inProcess && decryptedToken.slots.length > 1) {


      try {
        // Obtener el tiempo desde el token

        // Desencriptar el token
        const decryptedToken = JSON.parse(
          CryptoJS.AES.decrypt(
            tokenData,
            process.env.SECRET_KEY || "default_secret_key"
          ).toString(CryptoJS.enc.Utf8)
        );

        // Verificar que el estado del token sea 'inProcess'
        if (decryptedToken.status !== status.inProcess) {
          return res.status(400).json({ error: "El estado del token no permite el retiro." });
        }

        // Buscar las computadoras asociadas al token descifrado
        const computadoras = await prisma.computerToken.findMany({
          where: { tokenId: decryptedToken.id },
          include: {
            computer: {
              include: { cart: true }, // Incluye el objeto "cart" para obtener el id
            }, // Incluye el objeto "computer" para obtener el slot

          },
        });

        // Verificar si se encontraron computadoras asociadas al token
        if (computadoras.length === 0) {
          return res.status(404).json({ error: "No se encontraron computadoras asociadas al token." });
        }

        // Crear un array de slots ocupados
        const slots = Array(4).fill(0); // Aquí suponemos que hay 2 slots por defecto (puedes ajustar según sea necesario)

        // Asignar los slots correspondientes
        computadoras.forEach((c) => {
          if (c.computer.slot != null) { // Verificar que el slot no sea nul l
            slots[c.computer.slot - 1] = 1; // Marcamos el slot como ocupado
          }
        });

        // Actualizar el estado del token a 'withdrawn' (retirado)
        await prisma.token.update({
          where: { id: tokenData },
          data: { status: status.withdrawn },
        });

        // Desasociar las computadoras del carrito y actualizar la hora de salida (checkOutTime)
        // Elimina primero la asociación del cart
        await prisma.computer.updateMany({
          where: { id: { in: computadoras.map((c) => c.computer.id) } },
          data: {
            cartId: null // Desasociar la computadora del carrito
          },
        });

        // Luego actualiza el resto
        await prisma.computer.updateMany({
          where: { id: { in: computadoras.map((c) => c.computer.id) } },
          data: {
            checkOutTime: new Date(), // Registrar la hora de salida
            slot: null // Liberar el slot
          },
        });


        // Responder con éxito y los slots ocupados

        return res.status(200).json({ type: "multiple", slots: slots });
      } catch (error) {
        return res.status(500).json({ error: error.message });
      }


    }
  } catch (error) {
    return res.status(500).json(error.message);
  }
};

const requestReturn = async (req, res) => {
  res.header("Access-Control-Allow-Origin", "*");
  let availableSlot = null;

  try {
    const lastToken = await prisma.token.findFirst({
      where: { userId: parseInt(req.body.userId) },
      orderBy: { createdAt: 'desc' },
    });

    if (lastToken && lastToken.status === status.withdrawn) {
      const occupiedSlots = await prisma.computer.findMany({
        where: { cartId: parseInt(req.body.cartId) },
        select: { slot: true },
      });

      const cart = await prisma.cart.findFirst({
        where: { id: parseInt(req.body.cartId) },
      });

      const totalSlots = cart.slots;

      for (let i = 1; i <= totalSlots; i++) {
        if (!occupiedSlots.some((comp) => comp.slot === i)) {
          availableSlot = i;
          break;
        }
      }

      if (!availableSlot) {
        return res.status(400).json("No hay slots disponibles en el carro.");
      }

      let computer = await prisma.computerToken.findFirst({
        where: {
          tokenId: lastToken.id,
        },
      });

      let tokenHash = {
        userId: parseInt(req.body.userId),
        cartId: parseInt(req.body.cartId),
        computerId: computer.computerId,
        status: status.inReturnProcess,
        slot: availableSlot,
        createdAt: new Date(),
      };
      const createToken = CryptoJS.AES.encrypt(
        JSON.stringify(tokenHash),
        "42voxlY%z£u|65399(4:R.V1%H%VarK3"
      ).toString();

      const token = await prisma.token.create({
        data: {
          id: createToken,
          userId: tokenHash.userId,
          cartId: tokenHash.cartId,
          status: tokenHash.status,
          createdAt: tokenHash.createdAt,
          computers: {
            create: {
              computerId: tokenHash.computerId,
              slot: tokenHash.slot,
            },
          },
        },
      });

      return res.status(200).json({ tokenId: token.id, slot: availableSlot });
    } else {
      return res.status(400).json("El usuario no tiene computadoras para devolver o ya tiene su token de devolución.");
    }
  } catch (error) {
    return res.status(500).json(error.message);
  }
};



const deleteRequest = async (req, res) => {
  res.header("Access-Control-Allow-Origin", "*");

  try {
    await prisma.computerToken.deleteMany({
      where: { tokenId: req.body.token },
    });
    await prisma.token.delete({
      where: { id: req.body.token },
    });
   return res.status(200).json("Solicitud eliminada.");
  } catch (error) {
   return res.status(500).json(error.message);
  }
};

const getTime = async (req, res) => {
  res.header("Access-Control-Allow-Origin", "*");

  try {
    let decryptedToken = JSON.parse(CryptoJS.AES.decrypt(req.body.token, process.env.SECRET_KEY || "default_secret_key").toString(CryptoJS.enc.Utf8));
    const now = new Date();
    const elapsed = now.getTime() - new Date(decryptedToken.createdAt).getTime();

    const minutesElapsed = Math.floor(elapsed / 60000);
    const secondsElapsed = Math.floor((elapsed % 60000) / 1000);
    const totalSeconds = minutesElapsed * 60 + secondsElapsed;

    if (totalSeconds <= 300) {
     return res.status(200).json({ time: totalSeconds });
    } else {
      await deleteRequest(req, res);
      return res.status(201).json("El tiempo para retirar la computadora ha finalizado");
    }
  } catch (error) {
    return res.status(500).json(error.message);
  }
};



const transferComputer = async (req, res) => {
  res.header("Access-Control-Allow-Origin", "*");
  let { userId, computerId, professorId } = req.body;
  userId = await prisma.user.findFirst({
    where: {
      username: userId
    }
  })
  try {
    let response = await prisma.token.findFirst({
      include: {
        computers: true
      },
      where: {
        userId: parseInt(professorId),


        computers: {
          some: {
            computerId: parseInt(computerId)
          }
        }
      }
    })

    let tokenHash = {
      userId: parseInt(userId),
      cartId: parseInt(response.cartId),
      computerId: parseInt(computerId),
      status: status.transferida,
      slot: response.computers[0].slot,
      createdAt: new Date(),
    };
    const createToken = CryptoJS.AES.encrypt(
      JSON.stringify(tokenHash),
      "42voxlY%z£u|65399(4:R.V1%H%VarK3"
    ).toString();

    const token = await prisma.token.create({
      data: {
        id: createToken,
        userId: tokenHash.userId,
        cartId: tokenHash.cartId,
        status: tokenHash.status,
        createdAt: tokenHash.createdAt,
        computers: {
          create: {
            computerId: tokenHash.computerId,
            slot: tokenHash.slot,
          },
        },
      },
    });
    return res.status(200).json({ msg: "Transferencia realizada exitosamente" })
  } catch (error) {
    return res.status(500).json({ error: error })
  }
};


export const computerControllers = {
  requestComputer,
  withdrawComputer,
  requestReturn,
  deleteRequest,
  getTime,
  transferComputer
};



