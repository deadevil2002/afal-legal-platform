import { Router, type IRouter } from "express";
import healthRouter from "./health";
import procurementRouter from "./procurement";
import publicSupplierRouter from "./publicSupplier";

const router: IRouter = Router();

router.use(healthRouter);

// Internal procurement routes — auth enforcement added in Phase C
router.use("/procurement", procurementRouter);

// Public routes — no auth required (supplier form submissions)
router.use("/public", publicSupplierRouter);

export default router;
