import bcryptjs from 'bcryptjs';
import { prisma } from "../client.js";



const status = {
  inProcess: "En proceso",
  withdrawn: "Retirada",
  returned: "Devuelta",
  missing: "Faltante",
  noData: "No hay informacion"
};

const loginUser = async (req, res) => {
  res.header("Access-Control-Allow-Origin", "*");

  try {
    const user = await prisma.user.findUnique({
      where: { username: req.body.username }, // Cambié USER a username
    });

    if (user && bcryptjs.compareSync(req.body.password, user.password)) { // Cambié PASSWORD a password
      const token = await prisma.token.findFirst({
        orderBy: { createdAt: 'desc' },
        where: {
          userId: req.body.userId,
        },
      });
      if (!token) {
        return res.status(200).json({
          id: user.id,
          occupation: user.occupation, avatar: user.avatar,
          status: status.noData
        })
      }
      else if (token.status === status.inProcess) {
        return res.status(200).json({
          id: user.id,
          occupation: user.occupation, avatar: user.avatar,
          tokenId: token.id,
          slot: token.slot,
          status: token.status
        })
      } else {
        res.status(200).json({
          id: user.id,
          occupation: user.occupation, avatar: user.avatar, status: token.status
        });
      }



    } else {
      res.status(401).json("Usuario o contraseña incorrectos");
    }
  } catch (error) {
    res.status(500).json(error.message);
  }
};

const registerUser = async (req, res) => {
  res.header("Access-Control-Allow-Origin", "*");

  try {
    const hashedPassword = await bcryptjs.hash(req.body.password, 6); // Cambié PASSWORD a password
    const user = await prisma.user.create({
      data: {
        username: req.body.username, // Cambié USER a username
        password: hashedPassword, // Cambié PASSWORD a password
        occupation: "Estudiante", // Cambié OCUPACION a occupation
        avatar: req.body.avatar, // Cambié AVATAR a avatary
      },
    });

    res.status(200).json({
      id: user.id,
      occupation: user.occupation, // Cambié OCUPACION a occupation
      avatar: user.avatar, // Cambié AVATAR a avatar
    });
  } catch (error) {
    res.status(500).json(error.message);
  }
};

const deleteUser = async (req, res) => {
  res.header("Access-Control-Allow-Origin", "*");

  try {
    const user = await prisma.user.deleteMany({
      where: {
        username: req.body.username, // Cambié USER a username
      },
    });

    res.status(200).json({});
  } catch (error) {
    res.status(500).json(error.message);
  }
};


const registerNfc = async (req, res) => {
  res.header("Access-Control-Allow-Origin", "*");
  const { userId, rfid } = req.body;
  try {
    await prisma.user.update({
      where: { id: parseInt(userId) },
      data: { nfc: rfid },
    });
    res.status(200).json({ msg: "NFC registrado correctamente" });
  } catch (error) {
    res.status(500).json(error.message);

  }
}

const userStatus = async (req, res) => {
  try {
    let hola = await prisma.token.findFirst({
      where: {
        userId: parseInt(req.body.userId),
      },
      orderBy: {
        createdAt: "desc",
      },
    });
    console.log(await hola);
    if (!hola) {
      return res.status(200).json({ status: status.noData });
    }
    return res.status(200).json({ status: hola.status });
  } catch (error) {
    res.status(500).json(error.message);
  }
}




export const userControllers = {
  loginUser,
  registerUser,
  deleteUser,
  registerNfc,
  userStatus


};


