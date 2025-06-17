import { prisma } from '../client.js';
const status = {
   inProcess: "En proceso",
   withdrawn: "Retirada",
   returned: "Devuelta",
   missing: "Faltante",
   inReturnProcess: "En proceso devolucion"
};

const getTokens = async (req, res) => {
   let tokens = await prisma.computerToken.findMany({
      orderBy: {
         token: {
            createdAt: "desc"
         }
      },
      include: {
         token: {
            include: {
               user: true,
               cart: {
                  include: {
                     room: true
                  }
               }
            }
         }

      }

   });
   res.json({ tokens: tokens })
}


const filterTokens = async (req, res) => {
   const { type, data } = req.body
   let lista = []
   try {
      switch (type) {
         case "alumno":
            lista = await prisma.computerToken.findMany({
               orderBy: {
                  token: {
                     createdAt: "desc"
                  }
               },
               where: {
                  token: {
                     user: {
                        username: { contains: data.toString() }

                     }
                  }
               },
               include: {
                  token: {
                     include: {
                        user: true,
                        cart: {
                           include: {
                              room: true
                           }
                        }
                     }
                  }

               }

            },
            )
            break;
         case "ocupacion":
            lista = await prisma.computerToken.findMany({
               orderBy: {
                  token: {
                     createdAt: "desc"
                  }
               },
               where: {
                  token: {
                     user: {
                        occupation: { contains: data.toString() }

                     }
                  }
               },
               include: {
                  token: {
                     include: {
                        user: true,
                        cart: {
                           include: {
                              room: true
                           }
                        }
                     }
                  }

               }

            },
            )
            break;
         case "aula":
            lista = await prisma.computerToken.findMany({
               orderBy: {
                  token: {
                     createdAt: "desc"
                  }
               },
               where: {
                  token: {
                     cart: {
                        room: {
                           roomNumber: {
                              contains: data.toString()
                           }
                        }
                     }
                  }
               },
               include: {
                  token: {
                     include: {
                        user: true,
                        cart: {
                           include: {
                              room: true
                           }
                        }
                     }
                  }

               }

            },
            )
            break;
         case "computadora":
            lista = await prisma.computerToken.findMany({
               orderBy: {
                  token: {
                     createdAt: "desc"
                  }
               },
               where: {
                  computerId: {
                     equals: parseInt(data) || 0
                  }
               },
               include: {
                  token: {
                     include: {
                        user: true,
                        cart: {
                           include: {
                              room: true
                           }
                        }
                     }
                  }

               }

            },


            );
            break;
         case "status":
            lista = await prisma.computerToken.findMany({
               orderBy: {
                  token: {
                     createdAt: "desc"
                  }
               },
               where: {
                  token: {
                     status: {
                        contains: data
                     }
                  }
               },
               include: {
                  token: {
                     include: {
                        user: true,
                        cart: {
                           include: {
                              room: true
                           }
                        }
                     }
                  }

               }

            },


            );
            break;
         case "horario":
            lista = await prisma.computerToken.findMany({
               orderBy: {
                  token: {
                     createdAt: "desc"
                  }
               },
               where: {
                  token: {
                     createdAt: {
                        gte: new Date(`${data}T00:00:00Z`),
                        lte: new Date(`${data}T23:59:59Z`)

                     }

                  }
               },
               include: {
                  token: {
                     include: {
                        user: true,
                        cart: {
                           include: {
                              room: true
                           }
                        }
                     }
                  }

               }

            },


            );
            break;
         case "En uso":
            lista = await prisma.computerToken.findMany({
               orderBy: {
                  token: {
                     createdAt: "desc"
                  }
               },
               where: {
                  token: {
                     status: status.withdrawn,

                  }
               },
               include: {
                  token: {
                     include: {
                        user: true,
                        cart: {
                           include: {
                              room: true
                           }
                        }
                     }
                  }

               }



            }
            );

            lista.filter((item) => item.token.checkOutTime > item.token.checkInTime)



            break

         default:
            break;
      }





      res.json({ data: lista })
   } catch (error) {
      res.status(500).json({ error: error.message })

   }
}


export const asistenteControllers = {
   getTokens,
   filterTokens
}