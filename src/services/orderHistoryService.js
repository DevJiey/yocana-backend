const addOrderStatusHistory = async (
    client,
    orderId,
    status,
    note = null,
    changedBy = null
) => {
    await client.query(
        `INSERT INTO order_status_history
        (
            order_id,
            status,
            note,
            changed_by
        )
        VALUES ($1, $2, $3, $4)`,
        [
            orderId,
            status,
            note,
            changedBy
        ]
    );
};

module.exports = {
    addOrderStatusHistory,
};