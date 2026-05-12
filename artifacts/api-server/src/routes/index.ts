import { Router, type IRouter } from "express";
import healthRouter from "./health";
import devToolsRouter from "./devTools";
import procurementRouter from "./procurement";
import publicSupplierRouter from "./publicSupplier";
import adminUsersRouter from "./adminUsers";

const router: IRouter = Router();

// Health + readiness checks (always available)
router.use(healthRouter);

// Dev-only diagnostic routes (empty router in production)
router.use(devToolsRouter);

// Internal procurement routes — Firebase ID token auth enforced
router.use("/procurement", procurementRouter);

// Admin user management — Super Admin only, Firebase ID token auth enforced
router.use("/admin/users", adminUsersRouter);

// Public routes — no auth required (supplier form submissions)
router.use("/public", publicSupplierRouter);

export default router;
