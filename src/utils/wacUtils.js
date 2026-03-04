// WAC = Weighted Average Cost (Giá vốn bình quân gia quyền)
// WAC = (old_qty * old_avg + new_qty * new_price) / (old_qty + new_qty)
export function calculateWAC(oldQty, oldAvgCost, newQty, newUnitPrice) {
  if (oldQty + newQty <= 0) return oldAvgCost || newUnitPrice || 0;
  return ((oldQty * (oldAvgCost || 0)) + (newQty * newUnitPrice)) / (oldQty + newQty);
}
