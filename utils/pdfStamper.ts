

// --- Helpers ---

// Convert Base64 DataURI to Uint8Array
export const dataURItoUint8Array = (dataURI: string) => {
    try {
        if (!dataURI) return new Uint8Array(0);
        const split = dataURI.split(',');
        const base64 = split.length > 1 ? split[1] : dataURI;
        const byteString = atob(base64);
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
        }
        return ia;
    } catch (e) {
        console.error("Error converting Base64", e);
        return new Uint8Array(0);
    }
};

// Fetch Thai Font
const fetchThaiFont = async () => {
    try {
        const fontUrl = "https://script-app.github.io/font/THSarabunNew.ttf";
        const response = await fetch(fontUrl);
        const fontBuffer = await response.arrayBuffer();
        return fontBuffer;
    } catch (e) {
        console.error("Failed to load Thai font", e);
        throw new Error("ไม่สามารถโหลดฟอนต์ภาษาไทยได้");
    }
};

// Split text for word wrapping
const splitTextIntoLines = (text: string, maxWidth: number, fontSize: number, font: any) => {
    if (!text) return [];
    const words = text.split(''); // Thai characters don't have spaces like English
    const lines = [];
    let currentLine = words[0];

    for (let i = 1; i < words.length; i++) {
        const word = words[i];
        const width = font.widthOfTextAtSize(currentLine + word, fontSize);
        if (width < maxWidth) {
            currentLine += word;
        } else {
            lines.push(currentLine);
            currentLine = word;
        }
    }
    lines.push(currentLine);
    return lines;
};

// Format Date to Thai
const formatDateThai = (dateValue: Date) => {
    const months = [
        "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
        "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
    ];
    const day = dateValue.getDate();
    const month = months[dateValue.getMonth()];
    const year = dateValue.getFullYear() + 543;
    return `${day} ${month} ${year}`;
};

// --- STAMP: RECEIVE NUMBER (TOP RIGHT) ---
interface ReceiveStampOptions {
    fileBase64: string;
    bookNumber: string;
    date: string;     // Expecting full Thai date string e.g., "2 ธันวาคม 2568"
    time: string;     // Expecting time string e.g., "11.30 น."
    schoolName?: string;
}

export const stampReceiveNumber = async ({ fileBase64, bookNumber, date, time, schoolName }: ReceiveStampOptions): Promise<string> => {
    // Dynamic Import
    const { PDFDocument, rgb } = await import('pdf-lib');
    const fontkitModule = await import('@pdf-lib/fontkit');
    // @ts-ignore
    const fontkit = fontkitModule.default || fontkitModule;

    const existingPdfBytes = dataURItoUint8Array(fileBase64);
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    
    pdfDoc.registerFontkit(fontkit);
    const fontBytes = await fetchThaiFont();
    const thaiFont = await pdfDoc.embedFont(fontBytes);

    const pages = pdfDoc.getPages();
    const firstPage = pages[0];
    const { width, height } = firstPage.getSize();

    // Box Config (Slightly larger height and line height for breathing room)
    const fontSize = 14; 
    const lineHeight = 14; // Increased from 11 to 14 for better spacing
    const boxWidth = 150; 
    const boxHeight = 70;  // Increased from 50 to 70 for padding
    const margin = 20;
    
    const x = width - boxWidth - margin;
    const y = height - boxHeight - margin;

    // Draw Box Background
    firstPage.drawRectangle({
        x, y,
        width: boxWidth,
        height: boxHeight,
        color: rgb(1, 1, 1), // White
        borderColor: rgb(0.8, 0.2, 0.2), // Red Stamp Color
        borderWidth: 1.5,
    });

    // Color
    const stampColor = rgb(0.8, 0.2, 0.2);

    // Text Positioning - Added padding top
    const textX = x + 6;
    const paddingTop = 12; // Space from top border
    let currentY = y + boxHeight - paddingTop;

    // Line 1: School Name
    const school = schoolName || 'โรงเรียน...................';
    firstPage.drawText(school, {
        x: textX,
        y: currentY,
        size: fontSize,
        font: thaiFont,
        color: stampColor,
    });
    currentY -= lineHeight;

    // Line 2: Book Number
    firstPage.drawText(`เลขรับที่: ${bookNumber}`, {
        x: textX,
        y: currentY,
        size: fontSize,
        font: thaiFont,
        color: stampColor,
    });
    currentY -= lineHeight;

    // Line 3: Date
    firstPage.drawText(`วันที่: ${date}`, {
        x: textX,
        y: currentY,
        size: fontSize,
        font: thaiFont,
        color: stampColor,
    });
    currentY -= lineHeight;

    // Line 4: Time
    firstPage.drawText(`เวลา: ${time}`, {
        x: textX,
        y: currentY,
        size: fontSize,
        font: thaiFont,
        color: stampColor,
    });

    return await pdfDoc.saveAsBase64({ dataUri: true });
};

// --- STAMP: DIRECTOR COMMAND (BOTTOM RIGHT) ---

interface StampOptions {
    fileUrl: string;       
    fileType: string;      
    notifyToText: string;  
    commandText: string;   
    directorName: string;  
    directorPosition: string;
    signatureImageBase64?: string;
    schoolName?: string;
    targetPage?: number; // 1-based index
    onStatusChange: (status: string) => void; 
    
    // New Options for Signature
    signatureScale?: number;
    signatureYOffset?: number;
}

export const stampPdfDocument = async ({ 
    fileUrl, 
    fileType, 
    notifyToText, 
    commandText, 
    directorName, 
    directorPosition,
    signatureImageBase64,
    schoolName,
    targetPage = 1,
    onStatusChange,
    signatureScale = 1,
    signatureYOffset = 0
}: StampOptions): Promise<string> => {
    
    onStatusChange('กำลังโหลดไลบรารี PDF...');
    const { PDFDocument, rgb } = await import('pdf-lib');
    const fontkitModule = await import('@pdf-lib/fontkit');
    // @ts-ignore
    const fontkit = fontkitModule.default || fontkitModule;

    onStatusChange('กำลังโหลดฟอนต์และเตรียมเอกสาร...');

    let pdfDoc;
    // Determine if we are creating a fresh sheet or modifying existing
    const isNewSheet = fileType === 'new' || !fileUrl;

    if (!isNewSheet && fileType && fileType.includes('pdf')) {
            const existingPdfBytes = dataURItoUint8Array(fileUrl);
            pdfDoc = await PDFDocument.load(existingPdfBytes);
    } else if (!isNewSheet) {
        // Create PDF from Image
        pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage();
        const imageBytes = dataURItoUint8Array(fileUrl);
        
        let embeddedImage;
        if (fileType?.includes('png')) {
            embeddedImage = await pdfDoc.embedPng(imageBytes);
        } else {
            embeddedImage = await pdfDoc.embedJpg(imageBytes);
        }
        
        const { width, height } = embeddedImage.scaleToFit(page.getWidth(), page.getHeight());
        page.drawImage(embeddedImage, {
            x: (page.getWidth() - width) / 2,
            y: page.getHeight() - height,
            width, height,
        });
    } else {
        // Create new blank A4 document (Command Sheet) - FALLBACK ONLY
        pdfDoc = await PDFDocument.create();
        pdfDoc.addPage([595.28, 841.89]); // A4 Size
    }

    pdfDoc.registerFontkit(fontkit);
    const fontBytes = await fetchThaiFont();
    const thaiFont = await pdfDoc.embedFont(fontBytes);

    const pages = pdfDoc.getPages();
    
    // Select Target Page (Convert 1-based to 0-based)
    let pageIndex = (targetPage || 1) - 1;
    if (pageIndex < 0) pageIndex = 0;
    if (pageIndex >= pages.length) pageIndex = pages.length - 1; // Fallback to last page
    
    const targetPdfPage = pages[pageIndex];
    const pageWidth = targetPdfPage.getWidth();
    
    // Geometry
    const cmToPoints = 28.35;
    const bottomMargin = 0.5 * cmToPoints;
    const rightMargin = 0.5 * cmToPoints;
    
    // Logic: Place it BOTTOM RIGHT
    const boxWidth = 260; 
    const boxX = pageWidth - boxWidth - rightMargin;
    
    const fontSize = 14; 
    const lineHeight = fontSize * 1.05; // Very tight line spacing
    const maxWidth = boxWidth - 10;

    // Content Prep
    onStatusChange('กำลังเขียนคำสั่งการ...');
    
    // NOTE: Removed notifyToText as per request. Only printing command text.
    let commandLines: string[] = [];
    commandText.split('\n').forEach(line => {
        commandLines = [...commandLines, ...splitTextIntoLines(line, maxWidth, fontSize, thaiFont)];
    });

    const textBlockHeight = (commandLines.length) * lineHeight;
    
    // Footer Height Calculation (Sig + Name + School + Date)
    // Reduce signature block height to stick closer to text
    const signatureBlockHeight = 85; 
    const paddingHeight = 15;
    
    // Base height minimum ~3cm or fitted
    const baseBoxHeight = 3 * cmToPoints;
    const newBoxHeight = Math.max(baseBoxHeight, textBlockHeight + signatureBlockHeight + paddingHeight);

    // Position Y: Bottom of the page
    const newBoxY = bottomMargin;

    // Draw Box
    targetPdfPage.drawRectangle({
        x: boxX,
        y: newBoxY,
        width: boxWidth,
        height: newBoxHeight,
        color: rgb(0.97, 0.97, 0.97),
        borderColor: rgb(0, 0, 0.5),
        borderWidth: 1,
    });

    // Drawing Logic (Inside Box)
    // Start writing text from TOP of the box downwards
    let currentY = newBoxY + newBoxHeight - 20; // Start 20pts from top

    // Draw Command
    commandLines.forEach((line) => {
        targetPdfPage.drawText(line, {
            x: boxX + 8,
            y: currentY,
            size: fontSize,
            color: rgb(0, 0, 0),
            font: thaiFont,
        });
        currentY -= lineHeight;
    });

    // --- Footer Section (Signature, Name, School, Date) ---
    // We position this absolute from the BOTTOM of the box
    
    let footerY = newBoxY + 10; // Start 10pts from bottom
    const centerX = boxX + (boxWidth / 2);

    // 4. Draw Date (Bottom most)
    const dateText = formatDateThai(new Date());
    const dateWidth = thaiFont.widthOfTextAtSize(dateText, fontSize);
    
    targetPdfPage.drawText(dateText, {
        x: centerX - (dateWidth / 2),
        y: footerY,
        size: fontSize,
        font: thaiFont,
        color: rgb(0, 0, 0),
    });
    footerY += lineHeight;

    // 3. Draw School Name (Above Date)
    const schoolText = schoolName || 'โรงเรียน...................';
    const schoolWidth = thaiFont.widthOfTextAtSize(schoolText, fontSize);
    targetPdfPage.drawText(schoolText, {
         x: centerX - (schoolWidth / 2),
         y: footerY,
         size: fontSize,
         font: thaiFont,
         color: rgb(0, 0, 0)
    });
    footerY += lineHeight;

    // 2. Draw Director Name (Above School)
    const nameText = `( ${directorName} )`;
    const nameWidth = thaiFont.widthOfTextAtSize(nameText, fontSize);
    targetPdfPage.drawText(nameText, {
        x: centerX - (nameWidth / 2),
        y: footerY,
        size: fontSize,
        font: thaiFont,
        color: rgb(0, 0, 0),
    });
    footerY += (lineHeight + 5);

    // 1. Draw Signature Image (Above Name) with Scaling and Offset
    onStatusChange('กำลังประทับลายเซ็น...');
    
    if (signatureImageBase64) {
        try {
            const sigBytes = dataURItoUint8Array(signatureImageBase64);
            const sigImage = await pdfDoc.embedPng(sigBytes); // Assuming PNG for transparency
            
            // Apply Scaling
            const maxSigWidth = 80 * (signatureScale || 1);
            const maxSigHeight = 40 * (signatureScale || 1);
            
            const sigDims = sigImage.scaleToFit(maxSigWidth, maxSigHeight);
            
            // Apply Vertical Offset (Positive = Up, Negative = Down)
            const finalSigY = footerY + (signatureYOffset || 0);

            targetPdfPage.drawImage(sigImage, {
                x: centerX - (sigDims.width / 2),
                y: finalSigY, 
                width: sigDims.width,
                height: sigDims.height,
            });

        } catch (e) {
            console.warn("Could not embed signature image", e);
        }
    }

    const pdfBase64 = await pdfDoc.saveAsBase64({ dataUri: true });
    return pdfBase64;
};
