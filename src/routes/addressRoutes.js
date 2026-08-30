const express = require("express")

const {
    getMyAddresses,
    createAddress,
    updateAddress,
    setDefaultAddress,
    deleteAddress,
} = require("../controllers/addressController")

const authMiddleware = require("../middleware/authMiddleware")
const authorizeRoles = require("../middleware/roleMiddleware")

const router = express.Router()

router.get(
    "/",
    authMiddleware,
    authorizeRoles("customer"),
    getMyAddresses
)

router.post(
    "/",
    authMiddleware,
    authorizeRoles("customer"),
    createAddress
)

router.patch(
    "/:id",
    authMiddleware,
    authorizeRoles("customer"),
    updateAddress
)

router.patch(
    "/:id/default",
    authMiddleware,
    authorizeRoles("customer"),
    setDefaultAddress
)

router.delete(
    "/:id",
    authMiddleware,
    authorizeRoles("customer"),
    deleteAddress
)

module.exports = router