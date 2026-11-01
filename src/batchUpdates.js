export async function commitUpdatesInBatches(updates, createBatch, onProgress = () => {}) {
  let completed = 0;
  for (let offset = 0; offset < updates.length; offset += 400) {
    const batch = createBatch();
    for (const update of updates.slice(offset, offset + 400)) {
      batch.update(update.ref, update.data);
    }
    await batch.commit();
    completed += Math.min(400, updates.length - offset);
    onProgress(completed, updates.length);
  }
}
