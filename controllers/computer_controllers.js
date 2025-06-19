import { prisma } from '../client.js';
import CryptoJS from 'crypto-js';
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

  const { token: incomingToken, rfid, userId: rawUserId, cartId: rawCartId } = req.body;
  const cartId = parseInt(rawCartId);
  const isRFID = !incomingToken; // si viene por RFID
  let user;

  // 1) Obtener usuario según token o RFID
  try {
    if (isRFID) {
      user = await prisma.user.findUnique({ where: { nfc: rfid } });
    } else {
      const id = parseInt(rawUserId);
      user = await prisma.user.findUnique({ where: { id } });
    }
    if (!user) {
      const err = { error: "Usuario no encontrado" };
      return isRFID ? Promise.reject(err) : res.status(404).json(err);
    }
  } catch (err) {
    console.error("Error al obtener usuario:", err);
    return isRFID
      ? Promise.reject({ error: "Error al obtener el usuario" })
      : res.status(500).json({ error: "Error al obtener el usuario" });
  }

  const userId = user.id;

  try {
    // --- FLUJO PROFESOR ---
    if (user.occupation === "Profesor") {
      const existing = await prisma.token.findFirst({
        where: { userId, status: status.inProcess },
        orderBy: { createdAt: 'desc' },
      });
      if (existing) {
        const errMsg = { error: "El usuario no tiene permitido el retiro de computadoras" };
        return isRFID ? Promise.reject(errMsg) : res.status(403).json(errMsg);
      }

      const computers = await prisma.computer.findMany({ where: { cartId } });
      if (!computers.length) {
        const err = { error: "No hay computadoras disponibles." };
        return isRFID ? Promise.reject(err) : res.status(404).json(err);
      }

      const slots = Array(4).fill(0);
      const compIds = computers.map(({ id, slot }) => {
        if (slot != null) slots[slot - 1] = 1;
        return id;
      });

      const now = new Date();
      const payload = { userId, cartId, status: status.inProcess, createdAt: now, slots, computers: compIds };
      const secret = process.env.SECRET_KEY || "default_secret_key";
      const encrypted = CryptoJS.AES.encrypt(JSON.stringify(payload), secret).toString();

      // Transacción: crear token y relaciones
      const tokenRecord = await prisma.$transaction(async (tx) => {
        const token = await tx.token.create({
          data: { id: encrypted, userId, cartId, status: status.inProcess, createdAt: now }
        });
        await tx.computerToken.createMany({
          data: compIds.map((computerId, idx) => ({ computerId, tokenId: token.id, slot: slots[idx] })),
        });
        return token;
      });

      const result = { tokenId: tokenRecord.id, slots };
      return isRFID ? result : res.status(200).json(result);

    // --- FLUJO ESTUDIANTE ---
    } else if (user.occupation === "Estudiante") {
      const lastToken = await prisma.token.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });
      if (lastToken && lastToken.status !== status.returned) {
        const errMsg = { error: "El usuario no tiene permitido el retiro de computadoras" };
        return isRFID ? Promise.reject(errMsg) : res.status(403).json(errMsg);
      }

      // Transacción: seleccionar y crear token para estudiante
      const result = await prisma.$transaction(async (tx) => {
        const computers = await tx.computer.findMany({ where: { cartId } });
        if (!computers.length) throw new Error("No hay computadoras en el carrito.");

        const now = new Date();
        let selected = null;
        for (const comp of computers) {
          const elapsedHrs = (now - new Date(comp.checkInTime)) / 3600000;
          if (elapsedHrs >= 0) {
            const busy = await tx.token.findFirst({
              where: { computers: { some: { computerId: comp.id } }, status: status.inProcess },
              orderBy: { createdAt: 'desc' },
            });
            if (!busy) { selected = comp; break; }
          }
        }
        if (!selected) throw new Error("No hay computadoras disponibles.");

        const payload = { userId, cartId, status: status.inProcess, createdAt: now, computers: [selected.id], slots: [selected.slot] };
        const encrypted = CryptoJS.AES.encrypt(JSON.stringify(payload), secret).toString();

        const token = await tx.token.create({
          data: {
            id: encrypted,
            userId,
            cartId,
            status: status.inProcess,
            createdAt: now,
            computers: { create: { computerId: selected.id, slot: selected.slot } },
          },
        });

        return { tokenId: token.id, slots: selected.slot };
      });

      return isRFID ? result : res.status(200).json(result);
    }

    // Ocupación no válida
    const err = { error: "Ocupación no válida" };
    return isRFID ? Promise.reject(err) : res.status(400).json(err);

  } catch (err) {
    console.error("Error en requestComputer:", err);
    if (isRFID) throw err;
    const msg = err.error || err.message || "Error interno";
    return res.status(500).json({ error: msg });
  }
};


const withdrawComputer = async (req, res) => {
  res.header("Access-Control-Allow-Origin", "*");

  const { token: incomingToken, rfid, cartId: rawCartId } = req.body;
  const cartId = parseInt(rawCartId);
  let tokenString = incomingToken;
  let decrypted;

  // 1) Si no se proporciona token, generarlo vía requestComputer
  if (!incomingToken) {
    try {
      const user = await prisma.user.findUnique({ where: { nfc: rfid } });
      if (!user) throw new Error("Usuario no encontrado");
      const { tokenId } = await requestComputer(req, res);
      tokenString = tokenId;
    } catch (err) {
      return res.status(200).json(
        await professorControllers.returnWithRfid(req, res)
      );
    }
  }

  // 2) Desencriptar token
  try {
    const secret = process.env.SECRET_KEY || "default_secret_key";
    decrypted = JSON.parse(
      CryptoJS.AES.decrypt(tokenString, secret)
        .toString(CryptoJS.enc.Utf8)
    );
  } catch {
    return res.status(400).json({ error: "Token inválido" });
  }

  const { status: tokenStatus, slots } = decrypted;
  const returnSlot = decrypted.slot;

  try {
    // --- CASO A: Retiro único (un slot)
    if (tokenStatus === status.inProcess && Array.isArray(slots) && slots.length === 1) {
      await prisma.$transaction(async (tx) => {
        const tokenRec = await tx.token.findUnique({ where: { id: tokenString } });
        if (!tokenRec || tokenRec.status === status.withdrawn) {
          throw new Error("Token no encontrado o ya retirado");
        }
        await tx.token.update({
          where: { id: tokenString },
          data: { status: status.withdrawn },
        });
        await tx.computer.updateMany({
          where: { tokens: { some: { tokenId: tokenString } } },
          data: { cartId: null, checkOutTime: new Date(), slot: null },
        });
      });
      return res.status(200).json({ type: "unico", slots });

    // --- CASO B: Devolución única
    } else if (tokenStatus === status.inReturnProcess) {
      await prisma.$transaction(async (tx) => {
        const tokenRec = await tx.token.findFirst({
          where: { id: tokenString, cartId, status: status.inReturnProcess },
        });
        if (!tokenRec) {
          throw new Error("Token no está en returnProcess");
        }
        await tx.token.update({
          where: { id: tokenRec.id },
          data: { status: status.returned },
        });
        await tx.computer.updateMany({
          where: { tokens: { some: { tokenId: tokenRec.id } } },
          data: {
            cartId,
            slot: returnSlot,
            checkInTime: new Date(),
          },
        });
      });
      return res.status(200).json({ type: "unico", slots: [returnSlot] });

    // --- CASO C: Retiro múltiple
    } else if (tokenStatus === status.inProcess && Array.isArray(slots) && slots.length > 1) {
      const tokenComps = await prisma.computerToken.findMany({
        where: { tokenId: decrypted.id },
        include: { computer: true },
      });
      if (!tokenComps.length) {
        return res.status(404).json({ error: "No hay compus en el token" });
      }

      const occupiedSlots = Array(4).fill(0);
      tokenComps.forEach(({ computer }) => {
        if (computer.slot != null) occupiedSlots[computer.slot - 1] = 1;
      });

      await prisma.$transaction(async (tx) => {
        await tx.token.update({
          where: { id: tokenString },
          data: { status: status.withdrawn },
        });
        await tx.computer.updateMany({
          where: { id: { in: tokenComps.map(tc => tc.computer.id) } },
          data: { cartId: null },
        });
        await tx.computer.updateMany({
          where: { id: { in: tokenComps.map(tc => tc.computer.id) } },
          data: { checkOutTime: new Date(), slot: null },
        });
      });

      return res.status(200).json({ type: "multiple", slots: occupiedSlots });
    }

    return res.status(400).json({ error: "Operación no permitida para este estado" });

  } catch (err) {
    console.error("Error en withdrawComputer:", err);
    return res.status(500).json({ error: err.message });
  }
};

const requestReturn = async (req, res) => {
  res.header("Access-Control-Allow-Origin", "*");

  const { userId: rawUserId, cartId: rawCartId } = req.body;
  const userId = parseInt(rawUserId);
  const cartId = parseInt(rawCartId);

  try {
    // Obtener el último token del usuario
    const lastToken = await prisma.token.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    // Validar estado previo
    if (!lastToken || lastToken.status !== status.withdrawn) {
      return res.status(400).json(
        "El usuario no tiene computadoras para devolver o ya inició un proceso de devolución."
      );
    }

    // Iniciar transacción para asignar slot y crear token de devolución
    const result = await prisma.$transaction(async (tx) => {
      // Calcular slots ocupados en el carro
      const occupied = await tx.computer.findMany({
        where: { cartId },
        select: { slot: true },
      });
      const cart = await tx.cart.findUnique({ where: { id: cartId } });
      const totalSlots = cart.slots;

      // Buscar primer slot disponible
      let availableSlot = null;
      for (let i = 1; i <= totalSlots; i++) {
        if (!occupied.some((c) => c.slot === i)) {
          availableSlot = i;
          break;
        }
      }
      if (!availableSlot) {
        throw new Error("No hay slots disponibles en el carro.");
      }

      // Obtener la computadora asociada al último token
      const compToken = await tx.computerToken.findFirst({
        where: { tokenId: lastToken.id },
      });
      if (!compToken) {
        throw new Error("No se encontró la computadora asociada al token.");
      }

      // Preparar datos del nuevo token
      const now = new Date();
      const tokenPayload = {
        userId,
        cartId,
        computerId: compToken.computerId,
        status: status.inReturnProcess,
        slot: availableSlot,
        createdAt: now,
      };
      const secret = process.env.SECRET_KEY || "default_secret_key";
      const encrypted = CryptoJS.AES.encrypt(
        JSON.stringify(tokenPayload),
        secret
      ).toString();

      // Crear token y relación con computadora
      const newToken = await tx.token.create({
        data: {
          id: encrypted,
          userId,
          cartId,
          status: status.inReturnProcess,
          createdAt: now,
          computers: {
            create: { computerId: compToken.computerId, slot: availableSlot },
          },
        },
      });

      return { tokenId: newToken.id, slot: availableSlot };
    });

    // Devolver respuesta exitosa
    return res.status(200).json(result);

  } catch (error) {
    console.error("Error en requestReturn:", error);
    const msg = typeof error === 'string' ? error : error.message;
    return res.status(500).json({ error: msg });
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



