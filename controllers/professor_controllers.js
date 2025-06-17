import { randomUUID } from 'crypto';
import { prisma } from '../client.js';
import CryptoJS from 'crypto-js';

// Definición de los estados
const status = {
  inProcess: "En proceso",
  withdrawn: "Retirada",
  returned: "Devuelta",
  missing: "Faltante",
  inReturnProcess: "En proceso devolución",
};

// Función para solicitar computadoras


// Función para retirar computadoras



// Función para retornar computadoras usando RFID
const returnWithRfid = async (req, res) => {

  try {
    const { rfid, cartId } = req.body;
    console.log(rfid, cartId)

    // Buscar la computadora por el rfid
    const computer = await prisma.computer.findFirst({ where: { rfid:rfid,  } });

    if (!computer) return res.status(404).json({ type:"error", error: "Computadora no encontrada" });
    console.log(computer)
    // Buscar el último token relacionado con la computadora
    const lastToken = await prisma.computerToken.findFirst({
      where: { computerId: computer.id,  },
      orderBy: { token: { createdAt: 'desc' } },  // Orden descendente por fecha de creación del token
      include: { token: true },  // Incluir el token relacionado para obtener sus datos
    });
    console.log(lastToken)
    if (!lastToken || lastToken.token.status != status.withdrawn) return res.status(404).json({ type:"error", error: "Token no encontrado" });

    // Desencriptar el token
    const decryptedToken = JSON.parse(
      CryptoJS.AES.decrypt(lastToken.token.id, process.env.SECRET_KEY || "default_secret_key").toString(CryptoJS.enc.Utf8)
    );
    

    // Obtener un slot disponible en el carrito
    const availableSlot = await getAvailableSlot(cartId);
    if (!availableSlot) return res.status(400).json({ valid: false, error: "No hay slots disponibles." });

    // Crear los datos del token de retorno
    const returnTokenData = {
      userId: decryptedToken.userId,
      cartId: parseInt(cartId),
      computerId: computer.id,
      status: status.returned,
      slot: availableSlot,
      createdAt: new Date(),
    };

    // Encriptar el nuevo token de retorno
    const createToken = CryptoJS.AES.encrypt(
      JSON.stringify(returnTokenData),
      process.env.SECRET_KEY || "default_secret_key"
    ).toString();

    // Crear el nuevo token en la base de datos
    await prisma.token.create({
      data: {
        id: createToken,
        userId: returnTokenData.userId,
        cartId: returnTokenData.cartId,
        status: status.returned,
        createdAt: returnTokenData.createdAt,
        computers:{
          create:{
            computerId: returnTokenData.computerId,
            slot: returnTokenData.slot
          }
        }
      },
    });

    // Actualizar la computadora con el nuevo cartId y slot
    await prisma.computer.update({
      where: { id: computer.id },
      data: { cartId: returnTokenData.cartId, slot: returnTokenData.slot, checkInTime: new Date() },
    });

    // Devolver la respuesta exitosa con el slot
    return{ type: "unico", slots: returnTokenData.slot };
  } catch (error) {
    // Manejo de errores
    res.status(500).json({ type: "error", error: error.message });
  }
};

// Función auxiliar para obtener un slot disponible
const getAvailableSlot = async (cartId) => {
  const cart = await prisma.cart.findUnique({ where: { id: cartId } });
  if (!cart) return null;

  const occupiedSlots = await prisma.computer.findMany({
    where: { cartId },
    select: { slot: true },
  });
  const totalSlots = cart.slots;

  // Buscar un slot disponible
  for (let i = 1; i <= totalSlots; i++) {
    if (!occupiedSlots.some(c => c.slot === i)) return i;
  }
  return null;
};

// Función para verificar el tiempo del token
  

// Función auxiliar para obtener un slot disponible

// Función para verificar el tiempo del token
const time = async (req) => {
  const token = await prisma.token.findUnique({ where: { id: req.body.token } });
  if (!token) return "Token no encontrado";

  return (new Date().getTime() - new Date(token.createdAt).getTime()) / 1000;
};

// Función para eliminar la solicitud si ha expirado el tiempo
const deleteRequest = async (req, res) => {
  try {
    await prisma.token.delete({ where: { id: req.body.token } });
    await prisma.computerToken.deleteMany({ where: { tokenId: req.body.token } });
  } catch (error) {
    res.status(500).json({ error: "Error al eliminar la solicitud" });
  }
};

const getProfessorComputers = async(req,res)=>{
  res.header("Access-Control-Allow-Origin", "*");

  try {
    let computers = await prisma.computer.findMany({
      where:{
        tokens:{
          some:{
            
            token:{
              
              userId:parseInt(req.body.userId),
              status: status.withdrawn
            }
          }
        }
      },
      include:{
        tokens:{
          include:{
            token:true
          }
        },
        cart:{
          include:{
            tokens:{
              include:{           
                cart:{
                  include:{
                    room:true
                  }
                }
              }
            }
             
               
             
            ,
            room:{
              include:{
                carts:true
              }
            }
          }
        }
      }
    })
    res.status(200).json({computers:computers})
  } catch (error) {
    res.status(500).json({msg:error})
  }
  
}



export const professorControllers = {
  getProfessorComputers,
  returnWithRfid}