

import express from 'express';
import morgan from 'morgan';
import routes from "./routes.js";
import request from 'supertest';

import cors from "cors";
import { start } from 'repl';
let server;
const app = express();

const corsOptions = {
  origin: "*",
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE'], // Métodos permitidos
  allowedHeaders: ['Content-Type', 'Authorization'], // Encabezados permitidos

};


app.use(cors(corsOptions));
app.set("port", 3000);
app.use(morgan("dev"));
app.use(express.json());
app.use("/", routes);
/*let body = {
  cartId: 2,
  userId: 1
}*/
const startServer = () => {
  app.listen(app.get('port'), () => {
    console.log(`Servidor corriendo en puerto ${app.get('port')}`);
  });
};
startServer()
//const response = await request(app).post("/professor/request").send(body);

export default app;
