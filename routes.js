import { Router } from "express";
import { userControllers } from "./controllers/user_controllers.js";
import { computerControllers } from "./controllers/computer_controllers.js";
import { gettersControllers } from "./controllers/getters_controllers.js";
import { professorControllers } from "./controllers/professor_controllers.js";
import { asistenteControllers } from "./controllers/asistentes_controllers.js";




const router = Router();

router.post("/users/login", userControllers.loginUser);
router.post("/users/register", userControllers.registerUser);
router.post("/users/delete", userControllers.deleteUser);
router.post("/users/register/rfid", userControllers.registerNfc);

router.get("/rooms", gettersControllers.rooms);
router.post("/users/transactions", gettersControllers.transaccionesPasadas);
router.get("/rooms/habilitadas", gettersControllers.getRoomsWithAvailableSlots)
router.get("/asistente/tokens", asistenteControllers.getTokens)
router.post("/verificar", gettersControllers.retirada)
router.post("/asistente/tokens/filtrados", asistenteControllers.filterTokens)

router.put("/computers/withdrawal", computerControllers.withdrawComputer);
router.post("/computers/request", computerControllers.requestComputer);
router.delete("/computers/delete", computerControllers.deleteRequest);
router.post("/computers/time", computerControllers.getTime);
router.post("/computers/request-return", computerControllers.requestReturn);

router.post("/users/status", userControllers.userStatus);
router.put("/computers/transfer", computerControllers.transferComputer);
router.post("/professor/computers/use", professorControllers.getProfessorComputers)
router.put("/professor/return", professorControllers.returnWithRfid)
export default router;