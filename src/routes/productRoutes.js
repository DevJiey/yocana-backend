const express = require("express");

const {
    getProducts,
    getProductById,
    createProduct,
    updateProduct,
    updateProductStatus,
} = require("../controllers/productController");

const authMiddleware = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");

const router = express.Router();

// Public
router.get("/", getProducts);
router.get("/:id", getProductById);

// Admin only
router.post(
    "/",
    authMiddleware,
    authorizeRoles("admin"),
    createProduct
);

router.put(
    "/:id",
    authMiddleware,
    authorizeRoles("admin"),
    updateProduct
);

router.patch(
    "/:id/status",
    authMiddleware,
    authorizeRoles("admin"),
    updateProductStatus
);

module.exports = router;