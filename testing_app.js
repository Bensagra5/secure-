
import express from 'express';
import morgan from 'morgan';
import routes from "./routes.js";
import cors from "cors";
let server;
const app = express();

const corsOptions = {
  origin: "*",
  optionsSuccessStatus: 200
};

beforeAll(() => {
  // Guarda la instancia del servidor devuelta por app.listen
 server = app.listen(3000);
});

afterAll((done) => {
  // Cierra el servidor después de todas las pruebas
  server.close(done);
});
app.use(cors(corsOptions));
app.set("port", 3000);
app.use(morgan("dev"));
app.use(express.json());
app.use("/", routes);



export default app;






