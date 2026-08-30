const formatMoney = (amount) => {
    return Number(amount || 0).toLocaleString(
        "en-PH",
        {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }
    );
};


// ========================================
// BASE YOCANA EMAIL TEMPLATE
// ========================================

const baseEmailTemplate = ({
    title,
    greeting,
    message,
    content = "",
    footerMessage = "Thank you for choosing YOCANA.",
}) => {
    return `
        <div style="
            max-width: 600px;
            margin: 0 auto;
            font-family: Arial, sans-serif;
            color: #222222;
            background: #ffffff;
        ">

            <div style="
                background: #111111;
                color: #ffffff;
                padding: 28px 20px;
                text-align: center;
            ">
                <h1 style="
                    margin: 0;
                    letter-spacing: 4px;
                ">
                    YOCANA
                </h1>

                <p style="
                    margin: 8px 0 0;
                    color: #cccccc;
                    font-size: 13px;
                ">
                    Eau De Parfum
                </p>
            </div>

            <div style="
                padding: 30px 22px;
            ">
                <h2 style="
                    margin-top: 0;
                ">
                    ${title}
                </h2>

                ${greeting
            ? `<p>${greeting}</p>`
            : ""
        }

                ${message
            ? `<p>${message}</p>`
            : ""
        }

                ${content}

                <p style="
                    margin-top: 28px;
                ">
                    ${footerMessage}
                </p>

                <p style="
                    margin-top: 30px;
                    color: #777777;
                    font-size: 12px;
                    line-height: 1.5;
                ">
                    This is an automated notification
                    regarding your YOCANA order.
                    Please do not reply to this email.
                </p>
            </div>

        </div>
    `;
};


// ========================================
// ORDER CONFIRMATION
// ========================================

const orderConfirmationTemplate = ({
    customer,
    order,
    items,
}) => {

    const itemsHtml = items
        .map((item) => {

            const itemSubtotal =
                Number(item.price) *
                Number(item.quantity);

            return `
                <tr>
                    <td style="
                        padding: 10px 0;
                        border-bottom: 1px solid #eeeeee;
                    ">
                        ${item.name}
                    </td>

                    <td style="
                        padding: 10px 0;
                        text-align: center;
                        border-bottom: 1px solid #eeeeee;
                    ">
                        ${item.quantity}
                    </td>

                    <td style="
                        padding: 10px 0;
                        text-align: right;
                        border-bottom: 1px solid #eeeeee;
                    ">
                        ₱${formatMoney(itemSubtotal)}
                    </td>
                </tr>
            `;
        })
        .join("");

    const content = `
        <div style="
            background: #f5f5f5;
            padding: 16px;
            margin: 20px 0;
        ">
            <strong>Order Number</strong>
            <br>
            ${order.order_number}
        </div>

        <table style="
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
        ">
            <thead>
                <tr>
                    <th style="
                        text-align: left;
                        padding-bottom: 10px;
                    ">
                        Product
                    </th>

                    <th style="
                        text-align: center;
                        padding-bottom: 10px;
                    ">
                        Qty
                    </th>

                    <th style="
                        text-align: right;
                        padding-bottom: 10px;
                    ">
                        Amount
                    </th>
                </tr>
            </thead>

            <tbody>
                ${itemsHtml}
            </tbody>
        </table>

        <div style="
            margin-top: 22px;
            line-height: 1.8;
        ">
            <div>
                Subtotal:
                <strong>
                    ₱${formatMoney(order.subtotal)}
                </strong>
            </div>

            <div>
                Shipping Fee:
                <strong>
                    ₱${formatMoney(order.shipping_fee)}
                </strong>
            </div>

            ${Number(order.discount_amount) > 0
            ? `
                        <div>
                            Discount:
                            <strong>
                                -₱${formatMoney(
                order.discount_amount
            )}
                            </strong>
                        </div>
                    `
            : ""
        }

            <div style="
                font-size: 18px;
                margin-top: 8px;
            ">
                <strong>
                    Total:
                    ₱${formatMoney(order.total_amount)}
                </strong>
            </div>
        </div>

        <hr style="
            border: none;
            border-top: 1px solid #eeeeee;
            margin: 24px 0;
        ">

        <p>
            <strong>Payment Method:</strong><br>
            ${order.payment_method}
        </p>

        <p>
            <strong>Shipping Address:</strong><br>
            ${order.shipping_address}
        </p>

        <p>
            <strong>Shipping Region:</strong><br>
            ${order.shipping_region}
        </p>

        <p>
            <strong>Order Status:</strong><br>
            ${order.order_status}
        </p>
    `;

    return baseEmailTemplate({
        title: "Thank you for your order!",
        greeting: `Hi ${customer.first_name},`,
        message:
            "We have received your order and it is currently waiting to be processed.",
        content,
    });
};


// ========================================
// ORDER SHIPPED
// ========================================

const orderShippedTemplate = ({
    customer,
    order,
}) => {

    const content = `
        <div style="
            background: #f5f5f5;
            padding: 18px;
            margin: 20px 0;
            line-height: 1.7;
        ">
            <p>
                <strong>Order Number:</strong><br>
                ${order.order_number}
            </p>

            <p>
                <strong>Courier:</strong><br>
                ${order.courier_name || "N/A"}
            </p>

            <p>
                <strong>Tracking Number:</strong><br>
                ${order.tracking_number || "N/A"}
            </p>

            <p>
                <strong>Status:</strong><br>
                Shipped
            </p>
        </div>

        ${order.tracking_url
            ? `
                    <p>
                        Your tracking information is now
                        available. You can use the tracking
                        number above to follow your shipment.
                    </p>
                `
            : ""
        }
    `;

    return baseEmailTemplate({
        title: "Your order is on the way!",
        greeting: `Hi ${customer.first_name},`,
        message:
            "Your YOCANA order has been shipped and is now on its way to you.",
        content,
    });
};


// ========================================
// ORDER DELIVERED
// ========================================

const orderDeliveredTemplate = ({
    customer,
    order,
}) => {

    const content = `
        <div style="
            background: #f5f5f5;
            padding: 18px;
            margin: 20px 0;
            line-height: 1.7;
        ">
            <p>
                <strong>Order Number:</strong><br>
                ${order.order_number}
            </p>

            <p>
                <strong>Courier:</strong><br>
                ${order.courier_name || "N/A"}
            </p>

            <p>
                <strong>Tracking Number:</strong><br>
                ${order.tracking_number || "N/A"}
            </p>

            <p>
                <strong>Status:</strong><br>
                Delivered
            </p>
        </div>
    `;

    return baseEmailTemplate({
        title: "Your order has been delivered!",
        greeting: `Hi ${customer.first_name},`,
        message:
            "Your YOCANA order has been delivered successfully.",
        content,
        footerMessage:
            "Thank you for choosing YOCANA. We hope you enjoy your fragrance.",
    });
};

// ========================================
// CANCELLATION REQUEST RECEIVED
// ========================================

const cancellationRequestTemplate = ({
    customer,
    order,
    reason,
}) => {
    const content = `
        <div style="
            background: #f5f5f5;
            padding: 18px;
            margin: 20px 0;
            line-height: 1.7;
        ">
            <p>
                <strong>Order Number:</strong><br>
                ${order.order_number}
            </p>

            <p>
                <strong>Cancellation Reason:</strong><br>
                ${reason}
            </p>

            <p>
                <strong>Request Status:</strong><br>
                Pending Review
            </p>
        </div>

        <p>
            Our team will review your cancellation request.
            You will receive another notification once
            a decision has been made.
        </p>
    `;

    return baseEmailTemplate({
        title: "Cancellation request received",
        greeting: `Hi ${customer.first_name},`,
        message:
            "We have received your request to cancel your YOCANA order.",
        content,
        footerMessage:
            "Thank you for your patience while we review your request.",
    });
};

// ========================================
// CANCELLATION APPROVED
// ========================================

const cancellationApprovedTemplate = ({
    customer,
    order,
    reason,
    adminNote,
}) => {
    const content = `
        <div style="
            background: #f5f5f5;
            padding: 18px;
            margin: 20px 0;
            line-height: 1.7;
        ">
            <p>
                <strong>Order Number:</strong><br>
                ${order.order_number}
            </p>

            <p>
                <strong>Cancellation Reason:</strong><br>
                ${reason || "N/A"}
            </p>

            ${adminNote
            ? `
                        <p>
                            <strong>Admin Note:</strong><br>
                            ${adminNote}
                        </p>
                    `
            : ""
        }

            <p>
                <strong>Request Status:</strong><br>
                Approved
            </p>

            <p>
                <strong>Order Status:</strong><br>
                Cancelled
            </p>
        </div>

        <p>
            Your cancellation request has been approved
            and your order has been cancelled.
        </p>
    `;

    return baseEmailTemplate({
        title: "Cancellation request approved",
        greeting: `Hi ${customer.first_name},`,
        message:
            "Your YOCANA cancellation request has been approved.",
        content,
        footerMessage:
            "Thank you for choosing YOCANA.",
    });
};


// ========================================
// CANCELLATION REJECTED
// ========================================

const cancellationRejectedTemplate = ({
    customer,
    order,
    reason,
    adminNote,
}) => {
    const content = `
        <div style="
            background: #f5f5f5;
            padding: 18px;
            margin: 20px 0;
            line-height: 1.7;
        ">
            <p>
                <strong>Order Number:</strong><br>
                ${order.order_number}
            </p>

            <p>
                <strong>Cancellation Reason:</strong><br>
                ${reason || "N/A"}
            </p>

            ${adminNote
            ? `
                        <p>
                            <strong>Admin Note:</strong><br>
                            ${adminNote}
                        </p>
                    `
            : ""
        }

            <p>
                <strong>Request Status:</strong><br>
                Rejected
            </p>
        </div>

        <p>
            Your order has not been cancelled and will
            continue with its current order process.
        </p>
    `;

    return baseEmailTemplate({
        title: "Cancellation request update",
        greeting: `Hi ${customer.first_name},`,
        message:
            "Your YOCANA cancellation request was not approved.",
        content,
        footerMessage:
            "If you have questions regarding this decision, please contact YOCANA support.",
    });
};

// ========================================
// RETURN REQUEST RECEIVED
// ========================================

const returnRequestTemplate = ({
    customer,
    order,
    reason,
}) => {
    const content = `
        <div style="
            background: #f5f5f5;
            padding: 18px;
            margin: 20px 0;
            line-height: 1.7;
        ">
            <p>
                <strong>Order Number:</strong><br>
                ${order.order_number}
            </p>

            <p>
                <strong>Return Reason:</strong><br>
                ${reason}
            </p>

            <p>
                <strong>Request Status:</strong><br>
                Pending Review
            </p>
        </div>

        <p>
            Our team will review your return request.
            You will receive another notification once
            a decision has been made.
        </p>
    `;

    return baseEmailTemplate({
        title: "Return request received",
        greeting: `Hi ${customer.first_name},`,
        message:
            "We have received your request to return your YOCANA order.",
        content,
        footerMessage:
            "Thank you for your patience while we review your request.",
    });
};


// ========================================
// RETURN APPROVED
// ========================================

const returnApprovedTemplate = ({
    customer,
    order,
    reason,
    adminNote,
}) => {
    const content = `
        <div style="
            background: #f5f5f5;
            padding: 18px;
            margin: 20px 0;
            line-height: 1.7;
        ">
            <p>
                <strong>Order Number:</strong><br>
                ${order.order_number}
            </p>

            <p>
                <strong>Return Reason:</strong><br>
                ${reason || "N/A"}
            </p>

            ${adminNote
            ? `
                        <p>
                            <strong>Admin Note:</strong><br>
                            ${adminNote}
                        </p>
                    `
            : ""
        }

            <p>
                <strong>Request Status:</strong><br>
                Approved
            </p>
        </div>

        <p>
            Your return request has been approved.
            Please follow the return instructions provided
            by YOCANA for sending the item back.
        </p>
    `;

    return baseEmailTemplate({
        title: "Return request approved",
        greeting: `Hi ${customer.first_name},`,
        message:
            "Your YOCANA return request has been approved.",
        content,
        footerMessage:
            "We will notify you again once your returned item has been received and inspected.",
    });
};


// ========================================
// RETURN REJECTED
// ========================================

const returnRejectedTemplate = ({
    customer,
    order,
    reason,
    adminNote,
}) => {
    const content = `
        <div style="
            background: #f5f5f5;
            padding: 18px;
            margin: 20px 0;
            line-height: 1.7;
        ">
            <p>
                <strong>Order Number:</strong><br>
                ${order.order_number}
            </p>

            <p>
                <strong>Return Reason:</strong><br>
                ${reason || "N/A"}
            </p>

            ${adminNote
            ? `
                        <p>
                            <strong>Admin Note:</strong><br>
                            ${adminNote}
                        </p>
                    `
            : ""
        }

            <p>
                <strong>Request Status:</strong><br>
                Rejected
            </p>
        </div>

        <p>
            Your return request was not approved.
            Your order will remain in its current status.
        </p>
    `;

    return baseEmailTemplate({
        title: "Return request update",
        greeting: `Hi ${customer.first_name},`,
        message:
            "Your YOCANA return request was not approved.",
        content,
        footerMessage:
            "If you have questions regarding this decision, please contact YOCANA support.",
    });
};

// ========================================
// RETURN COMPLETED
// ========================================

const returnCompletedTemplate = ({
    customer,
    order,
    isResellable,
    inspectionNote,
}) => {
    const content = `
        <div style="
            background: #f5f5f5;
            padding: 18px;
            margin: 20px 0;
            line-height: 1.7;
        ">
            <p>
                <strong>Order Number:</strong><br>
                ${order.order_number}
            </p>

            <p>
                <strong>Return Status:</strong><br>
                Returned
            </p>

            <p>
                <strong>Inspection:</strong><br>
                ${isResellable
            ? "Item received and accepted."
            : "Item received and inspected."
        }
            </p>

            ${inspectionNote
            ? `
                        <p>
                            <strong>Inspection Note:</strong><br>
                            ${inspectionNote}
                        </p>
                    `
            : ""
        }
        </div>

        <p>
            We have successfully received and processed
            your returned item.
        </p>

        <p>
            If your order is eligible for a refund,
            the refund will be processed separately.
            You will receive another notification once
            the refund has been completed.
        </p>
    `;

    return baseEmailTemplate({
        title: "Return completed",
        greeting: `Hi ${customer.first_name},`,
        message:
            "Your returned YOCANA order has been received and inspected.",
        content,
        footerMessage:
            "Thank you for your patience throughout the return process.",
    });
};

// ========================================
// REFUND PROCESSED
// ========================================

const refundProcessedTemplate = ({
    customer,
    order,
    refund,
}) => {
    const amount = formatMoney(refund.amount);

    const content = `
        <div style="
            background: #f5f5f5;
            padding: 18px;
            margin: 20px 0;
            line-height: 1.7;
        ">
            <p>
                <strong>Order Number:</strong><br>
                ${order.order_number}
            </p>

            <p>
                <strong>Refund Amount:</strong><br>
                ${amount}
            </p>

            <p>
                <strong>Refund Method:</strong><br>
                ${refund.refund_method}
            </p>

            <p>
                <strong>Reference Number:</strong><br>
                ${refund.reference_number}
            </p>

            <p>
                <strong>Refund Status:</strong><br>
                Refunded
            </p>
        </div>

        <p>
            Your refund has been successfully processed.
        </p>

        <p>
            Please note that the original shipping fee
            is not included in the refunded amount.
        </p>
    `;

    return baseEmailTemplate({
        title: "Refund processed",
        greeting: `Hi ${customer.first_name},`,
        message:
            "Your YOCANA refund has been successfully processed.",
        content,
        footerMessage:
            "Thank you for your patience throughout the return and refund process.",
    });
};

// ========================================
// PAYMENT SUCCESSFUL
// ========================================

const paymentSuccessfulTemplate = ({
    customer,
    order,
    payment,
}) => {
    const amount = formatMoney(payment.amount);

    const content = `
        <div style="
            background: #f5f5f5;
            padding: 18px;
            margin: 20px 0;
            line-height: 1.7;
        ">
            <p>
                <strong>Order Number:</strong><br>
                ${order.order_number}
            </p>

            <p>
                <strong>Amount Paid:</strong><br>
                ${amount}
            </p>

            <p>
                <strong>Payment Method:</strong><br>
                ${payment.payment_method}
            </p>

            <p>
                <strong>Transaction Reference:</strong><br>
                ${payment.transaction_reference || "N/A"}
            </p>

            <p>
                <strong>Payment Status:</strong><br>
                Paid
            </p>
        </div>

        <p>
            Your payment has been successfully recorded.
        </p>
    `;

    return baseEmailTemplate({
        title: "Payment successful",
        greeting: `Hi ${customer.first_name},`,
        message:
            "Thank you. Your payment for your YOCANA order has been successfully completed.",
        content,
        footerMessage:
            "Thank you for choosing YOCANA.",
    });
};

module.exports = {
    orderConfirmationTemplate,
    orderShippedTemplate,
    orderDeliveredTemplate,
    cancellationRequestTemplate,
    cancellationApprovedTemplate,
    cancellationRejectedTemplate,
    returnRequestTemplate,
    returnApprovedTemplate,
    returnRejectedTemplate,
    returnCompletedTemplate,
    refundProcessedTemplate,
    paymentSuccessfulTemplate,
};