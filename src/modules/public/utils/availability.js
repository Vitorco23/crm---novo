export function getAvailability() {
    const now = new Date();
    const day = now.getDate();
    const month = now.getMonth();
    let teto = 7;
    if (day <= 7)
        teto = 30;
    else if (day <= 14)
        teto = 21;
    else if (day <= 21)
        teto = 14;
    const key = `p21_availability_${now.getFullYear()}_${month}`;
    const stored = localStorage.getItem(key);
    const data = stored ? JSON.parse(stored) : { count: teto, lastDate: 0 };
    // Se passou para um novo dia, reduz (máximo uma vez por 24h)
    const today = now.toDateString();
    if (data.lastDate !== today) {
        // Reduz apenas se estiver acima do valor mínimo ou se o novo teto exigir
        const newVal = Math.max(3, Math.min(data.count - 1, teto));
        localStorage.setItem(key, JSON.stringify({ count: newVal, lastDate: today }));
        return newVal;
    }
    return Math.max(3, Math.min(data.count, teto));
}
