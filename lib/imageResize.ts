export async function fileToCoverDataUrl(file: File, max = 320): Promise<string> {
    if (!file.type.startsWith("image/")) {
        throw new Error("Ce fichier n'est pas une image");
    }

    let img: ImageBitmap | HTMLImageElement | null = null;
    let objectUrl: string | null = null;

    try {
        try {
            img = await createImageBitmap(file);
        } catch (e) {
            const el = new Image();
            objectUrl = URL.createObjectURL(file);
            el.src = objectUrl;
            await new Promise<void>((resolve, reject) => {
                el.onload = () => resolve();
                el.onerror = () => reject(new Error("Image illisible"));
            });
            img = el;
        }

        const src = img as ImageBitmap | HTMLImageElement;
        const side = Math.min(src.width, src.height);
        const size = Math.min(max, side);
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");

        if (!ctx) {
            throw new Error("Impossible de créer un contexte 2D");
        }

        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, size, size);

        const offsetX = (src.width - side) / 2;
        const offsetY = (src.height - side) / 2;

        ctx.drawImage(src, offsetX, offsetY, side, side, 0, 0, size, size);

        let dataUrl = canvas.toDataURL("image/jpeg", 0.82);

        if (dataUrl.length > 120000) {
            canvas.width = 224;
            canvas.height = 224;
            ctx.fillStyle = "white";
            ctx.fillRect(0, 0, 224, 224);
            ctx.drawImage(src, offsetX, offsetY, side, side, 0, 0, 224, 224);
            dataUrl = canvas.toDataURL("image/jpeg", 0.6);
        }

        return dataUrl;
    } finally {
        if (img && "close" in img) {
            img.close();
        }
        if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
        }
    }
}
