const express = require("express");

const {
    addToCart,
    getCart,
    updateCartItem,
    removeCartItem,
} = require("../controllers/cartController");

const authMiddleware = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");

const router = express.Router();

router.post(
    "/items",
    authMiddleware,
    authorizeRoles("customer"),
    addToCart
);

router.get(
    "/",
    authMiddleware,
    authorizeRoles("customer"),
    getCart
);

router.put(
    "/items/:id",
    authMiddleware,
    authorizeRoles("customer"),
    updateCartItem
);

router.delete(
    "/items/:id",
    authMiddleware,
    authorizeRoles("customer"),
    removeCartItem
);

module.exports = router;