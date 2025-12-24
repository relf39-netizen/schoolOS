
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

// --- Helpers ---

// Convert Arabic numbers to Thai digits
export const toThaiDigits = (num: string | number): string => {
    const thaiDigits = ['๐', '๑', '๒', '๓', '๔', '๕', '๖', '๗', '๘', '๙'];
    return num.toString().replace(/\d/g, (d) => thaiDigits[parseInt(d)]);
};

// Convert Base64 DataURI to Uint8Array
export const dataURItoUint8Array = (dataURI: string) => {
    try {
        if (!dataURI) return new Uint8Array(0);
        
        // Remove whitespace and potential hidden characters
        const cleanURI = dataURI.trim();
        const split = cleanURI.split(',');
        const base64 = split.length > 1 ? split[1] : cleanURI;
        
        // Final sanity check for atob
        const byteString = atob(base64.replace(/\s/g, ''));
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
    const words = text.split(''); 
    const lines = [];
    let currentLine = words[0] || "";

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
    if (currentLine) lines.push(currentLine);
    return lines;
};

// Format Date to Thai (Full Month & Buddhist Year)
const formatDateThai = (dateValue: Date, useThaiDigits = false) => {
    const months = [
        "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
        "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
    ];
    const day = dateValue.getDate();
    const month = months[dateValue.getMonth()];
    const year = dateValue.getFullYear() + 543;
    const result = `${day} ${month} ${year}`;
    return useThaiDigits ? toThaiDigits(result) : result;
};

const formatDateThaiStr = (dateStr: string, useThaiDigits = false) => {
    if (!dateStr) return "....................";
    return formatDateThai(new Date(dateStr), useThaiDigits);
};

// --- STAMP: RECEIVE NUMBER (TOP RIGHT) ---
interface ReceiveStampOptions {
    fileBase64: string;
    bookNumber: string;
    date: string;
    time: string;
    schoolName?: string;
    schoolLogoBase64?: string;
}

export const stampReceiveNumber = async ({ fileBase64, bookNumber, date, time, schoolName, schoolLogoBase64 }: ReceiveStampOptions): Promise<string> => {
    const existingPdfBytes = dataURItoUint8Array(fileBase64);
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    
    pdfDoc.registerFontkit(fontkit as any);
    const fontBytes = await fetchThaiFont();
    const thaiFont = await pdfDoc.embedFont(fontBytes);

    const pages = pdfDoc.getPages();
    const firstPage = pages[0];
    const { width, height } = firstPage.getSize();

    const fontSize = 14; 
    const lineHeight = 18; 
    const boxWidth = 160; 
    const boxHeight = 85; 
    const margin = 20;
    
    const x = width - boxWidth - margin;
    const y = height - boxHeight - margin;

    firstPage.drawRectangle({
        x, y,
        width: boxWidth,
        height: boxHeight,
        color: rgb(1, 1, 1),
        borderColor: rgb(0.8, 0.2, 0.2),
        borderWidth: 1.5,
    });

    const stampColor = rgb(0.8, 0.2, 0.2);
    const textX = x + 6;
    const paddingTop = 12; 
    let currentY = y + boxHeight - paddingTop;

    const school = schoolName || 'โรงเรียน...................';
    
    if (schoolLogoBase64) {
        try {
            const logoBytes = dataURItoUint8Array(schoolLogoBase64);
            let logoImage;
            if(schoolLogoBase64.toLowerCase().includes('png')) logoImage = await pdfDoc.embedPng(logoBytes);
            else logoImage = await pdfDoc.embedJpg(logoBytes);
            
            const logoDim = logoImage.scaleToFit(20, 20);
            
            firstPage.drawImage(logoImage, {
                x: textX,
                y: currentY - 2,
                width: logoDim.width,
                height: logoDim.height
            });
            
            firstPage.drawText(school, {
                x: textX + 24,
                y: currentY,
                size: fontSize,
                font: thaiFont,
                color: stampColor,
            });
        } catch(e) {
             firstPage.drawText(school, {
                x: textX,
                y: currentY,
                size: fontSize,
                font: thaiFont,
                color: stampColor,
            });
        }
    } else {
        firstPage.drawText(school, {
            x: textX,
            y: currentY,
            size: fontSize,
            font: thaiFont,
            color: stampColor,
        });
    }

    currentY -= lineHeight;
    firstPage.drawText(`เลขรับที่: ${bookNumber}`, { x: textX, y: currentY, size: fontSize, font: thaiFont, color: stampColor });
    currentY -= lineHeight;
    firstPage.drawText(`วันที่: ${date}`, { x: textX, y: currentY, size: fontSize, font: thaiFont, color: stampColor });
    currentY -= lineHeight;
    firstPage.drawText(`เวลา: ${time}`, { x: textX, y: currentY, size: fontSize, font: thaiFont, color: stampColor });

    return await pdfDoc.saveAsBase64({ dataUri: true });
};

// --- STAMP: COMMAND (Hierarchical Support) ---
interface StampOptions {
    fileUrl: string;       
    fileType: string;      
    notifyToText: string;  
    commandText: string;   
    directorName: string;  
    directorPosition: string;
    signatureImageBase64?: string;
    schoolName?: string;
    schoolLogoBase64?: string;
    targetPage?: number;
    onStatusChange: (status: string) => void; 
    signatureScale?: number;
    signatureYOffset?: number;
    alignment?: 'left' | 'right';
}

export const stampPdfDocument = async ({ 
    fileUrl, fileType, commandText, directorName, directorPosition, signatureImageBase64, schoolName, targetPage = 1, onStatusChange, signatureScale = 1, signatureYOffset = 0, alignment = 'right'
}: StampOptions): Promise<string> => {
    
    onStatusChange('กำลังเตรียมเอกสาร...');

    let pdfDoc;
    const isNewSheet = fileType === 'new' || !fileUrl;

    if (!isNewSheet && fileType && fileType.includes('pdf')) {
            const existingPdfBytes = dataURItoUint8Array(fileUrl);
            pdfDoc = await PDFDocument.load(existingPdfBytes);
    } else if (!isNewSheet) {
        pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage();
        const imageBytes = dataURItoUint8Array(fileUrl);
        let embeddedImage;
        if (fileType?.toLowerCase().includes('png')) embeddedImage = await pdfDoc.embedPng(imageBytes);
        else embeddedImage = await pdfDoc.embedJpg(imageBytes);
        const { width, height } = embeddedImage.scaleToFit(page.getWidth(), page.getHeight());
        page.drawImage(embeddedImage, { x: (page.getWidth() - width) / 2, y: page.getHeight() - height, width, height });
    } else {
        pdfDoc = await PDFDocument.create();
        pdfDoc.addPage([595.28, 841.89]);
    }

    pdfDoc.registerFontkit(fontkit as any);
    const fontBytes = await fetchThaiFont();
    const thaiFont = await pdfDoc.embedFont(fontBytes);

    const pages = pdfDoc.getPages();
    let pageIndex = (targetPage || 1) - 1;
    if (pageIndex < 0) pageIndex = 0;
    if (pageIndex >= pages.length) pageIndex = pages.length - 1; 
    
    const targetPdfPage = pages[pageIndex];
    const pageWidth = targetPdfPage.getWidth();
    
    const cmToPoints = 28.35;
    const bottomMargin = 0.5 * cmToPoints;
    const horizontalMargin = 0.5 * cmToPoints;
    const boxWidth = 260; 
    
    // Position box based on alignment (Hierarchy: Director right, Vice-director left)
    const boxX = alignment === 'left' 
        ? horizontalMargin 
        : pageWidth - boxWidth - horizontalMargin;

    const fontSize = 14; 
    const lineHeight = fontSize * 1.05; 
    const maxWidth = boxWidth - 10;

    onStatusChange('กำลังเขียนข้อความ...');
    
    let commandLines: string[] = [];
    commandText.split('\n').forEach(line => {
        commandLines = [...commandLines, ...splitTextIntoLines(line, maxWidth, fontSize, thaiFont)];
    });

    const textBlockHeight = (commandLines.length) * lineHeight;
    const signatureBlockHeight = 85; 
    const paddingHeight = 15;
    const baseBoxHeight = 3 * cmToPoints;
    const newBoxHeight = Math.max(baseBoxHeight, textBlockHeight + signatureBlockHeight + paddingHeight);
    const newBoxY = bottomMargin;

    targetPdfPage.drawRectangle({
        x: boxX, y: newBoxY, width: boxWidth, height: newBoxHeight,
        color: rgb(0.97, 0.97, 0.97), borderColor: rgb(0, 0, 0.5), borderWidth: 1,
    });

    let currentY = newBoxY + newBoxHeight - 20; 
    commandLines.forEach((line) => {
        targetPdfPage.drawText(line, { x: boxX + 8, y: currentY, size: fontSize, color: rgb(0, 0, 0), font: thaiFont });
        currentY -= lineHeight;
    });

    let footerY = newBoxY + 10; 
    const centerX = boxX + (boxWidth / 2);

    const dateText = formatDateThai(new Date());
    const dateWidth = thaiFont.widthOfTextAtSize(dateText, fontSize);
    targetPdfPage.drawText(dateText, { x: centerX - (dateWidth / 2), y: footerY, size: fontSize, font: thaiFont, color: rgb(0, 0, 0) });
    footerY += lineHeight;

    // FIX: มั่นใจว่าใช้ตำแหน่งที่ส่งมา ไม่ Default เป็น ผอ. ทันที
    const posText = directorPosition && directorPosition.length > 2 
        ? directorPosition 
        : `ผู้อำนวยการ${schoolName || '...................'}`;
        
    const posWidth = thaiFont.widthOfTextAtSize(posText, fontSize);
    targetPdfPage.drawText(posText, { x: centerX - (posWidth / 2), y: footerY, size: fontSize, font: thaiFont, color: rgb(0, 0, 0) });
    footerY += lineHeight;

    const nameText = `( ${directorName} )`;
    const nameWidth = thaiFont.widthOfTextAtSize(nameText, fontSize);
    targetPdfPage.drawText(nameText, { x: centerX - (nameWidth / 2), y: footerY, size: fontSize, font: thaiFont, color: rgb(0, 0, 0) });
    footerY += (lineHeight + 5);

    if (signatureImageBase64) {
        try {
            const sigBytes = dataURItoUint8Array(signatureImageBase64);
            let sigImage;
            if (signatureImageBase64.toLowerCase().includes('png')) sigImage = await pdfDoc.embedPng(sigBytes);
            else sigImage = await pdfDoc.embedJpg(sigBytes);

            const maxSigWidth = 80 * (signatureScale || 1);
            const maxSigHeight = 40 * (signatureScale || 1);
            const sigDims = sigImage.scaleToFit(maxSigWidth, maxSigHeight);
            const finalSigY = footerY + (signatureYOffset || 0);
            targetPdfPage.drawImage(sigImage, { x: centerX - (sigDims.width / 2), y: finalSigY, width: sigDims.width, height: sigDims.height });
        } catch (e) { console.warn("Could not embed signature", e); }
    }

    return await pdfDoc.saveAsBase64({ dataUri: true });
};


// --- GENERATE OFFICIAL LEAVE FORM (FULL PAGE) ---

interface LeavePdfOptions {
    req: any;
    stats: any;
    teacher: any;
    schoolName: string;
    directorName: string;
    directorSignatureBase64?: string;
    teacherSignatureBase64?: string;
    officialGarudaBase64?: string; 
    directorSignatureScale?: number;
    directorSignatureYOffset?: number;
}

export const generateOfficialLeavePdf = async (options: LeavePdfOptions): Promise<string> => {
    const { req, stats, teacher, schoolName, directorName, directorSignatureBase64, teacherSignatureBase64, officialGarudaBase64 } = options;
    
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); 
    const { width, height } = page.getSize();
    
    pdfDoc.registerFontkit(fontkit as any);
    const fontBytes = await fetchThaiFont();
    const thaiFont = await pdfDoc.embedFont(fontBytes);

    const fontSize = 16;
    const lineHeight = 18; 
    const margin = 50;
    const contentWidth = width - (2 * margin);
    const indent = 60; 

    const drawCentered = (text: string, y: number, size: number = 16) => {
        const textWidth = thaiFont.widthOfTextAtSize(text, size);
        page.drawText(text, { x: (width - textWidth) / 2, y, size, font: thaiFont });
    };

    const drawParagraphContinuous = (text: string, startY: number, hasIndent: boolean = true) => {
        let curY = startY;
        let remainingText = text;
        
        let availableWidth = contentWidth - (hasIndent ? indent : 0);
        let words = remainingText.split('');
        let line = "";
        
        while(words.length > 0) {
            const w = words[0];
            const testLine = line + w;
            const testWidth = thaiFont.widthOfTextAtSize(testLine, fontSize);
            if(testWidth < availableWidth) {
                line += w;
                words.shift();
            } else {
                break;
            }
        }
        
        page.drawText(line, { x: hasIndent ? margin + indent : margin, y: curY, size: fontSize, font: thaiFont });
        curY -= lineHeight;
        remainingText = words.join('');
        
        if (remainingText.length > 0) {
            const subsequentLines = splitTextIntoLines(remainingText, contentWidth, fontSize, thaiFont);
            subsequentLines.forEach(l => {
                page.drawText(l, { x: margin, y: curY, size: fontSize, font: thaiFont });
                curY -= lineHeight;
            });
        }
        
        return curY;
    };

    try {
        let garudaImage;
        if (officialGarudaBase64) {
             const gBytes = dataURItoUint8Array(officialGarudaBase64);
             if (officialGarudaBase64.toLowerCase().includes('png')) garudaImage = await pdfDoc.embedPng(gBytes);
             else garudaImage = await pdfDoc.embedJpg(gBytes);
        } else {
             const garudaUrl = "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8f/Emblem_of_the_Ministry_of_Education_of_Thailand.svg/1200px-Emblem_of_the_Ministry_of_Education_of_Thailand.svg.png";
             const resp = await fetch(garudaUrl);
             const garudaBuffer = await resp.arrayBuffer();
             garudaImage = await pdfDoc.embedPng(garudaBuffer);
        }

        const garudaDim = garudaImage.scaleToFit(60, 60);
        page.drawImage(garudaImage, {
            x: (width - garudaDim.width) / 2,
            y: height - margin - 60,
            width: garudaDim.width,
            height: garudaDim.height
        });
    } catch (e) { console.warn("Garuda load failed", e); }

    let currentY = height - margin - 80;

    let formTitle = "แบบใบลาป่วย ลาคลอดบุตร ลากิจส่วนตัว";
    if (req.type === 'Late') formTitle = "แบบขออนุญาตเข้าสาย";
    if (req.type === 'OffCampus') formTitle = "แบบขออนุญาตออกนอกบริเวณโรงเรียน";
    drawCentered(formTitle, currentY, 20);
    currentY -= 30;

    const writeAt = `เขียนที่ ${schoolName}`;
    const dateStr = `วันที่ ${new Date().getDate()} เดือน ${new Date().toLocaleString('th-TH', { month: 'long' })} พ.ศ. ${new Date().getFullYear() + 543}`;
    
    const writeAtWidth = thaiFont.widthOfTextAtSize(writeAt, fontSize);
    page.drawText(writeAt, { x: width - margin - writeAtWidth - 20, y: currentY, size: fontSize, font: thaiFont });
    currentY -= lineHeight;
    
    const dateStrWidth = thaiFont.widthOfTextAtSize(dateStr, fontSize);
    page.drawText(dateStr, { x: width - margin - dateStrWidth - 20, y: currentY, size: fontSize, font: thaiFont });
    currentY -= (lineHeight * 2);

    const getLeaveTypeName = (type: string) => {
        const map: any = { 'Sick': 'ป่วย', 'Personal': 'กิจส่วนตัว', 'OffCampus': 'ออกนอกบริเวณ', 'Late': 'เข้าสาย', 'Maternity': 'คลอดบุตร' };
        return map[type] || type;
    };
    
    page.drawText(`เรื่อง  ขออนุญาต${getLeaveTypeName(req.type)}`, { x: margin, y: currentY, size: fontSize, font: thaiFont });
    currentY -= lineHeight;
    currentY -= lineHeight;
    page.drawText(`เรียน  ผู้อำนวยการ${schoolName}`, { x: margin, y: currentY, size: fontSize, font: thaiFont });
    currentY -= (lineHeight * 2);

    const p1_identity = `ข้าพเจ้า ${teacher.name} ตำแหน่ง ${teacher.position} สังกัด ${schoolName}`;
    currentY = drawParagraphContinuous(p1_identity, currentY, true);

    let p1_request = "";
    const startDate = formatDateThaiStr(req.startDate);
    const endDate = formatDateThaiStr(req.endDate);
    let timeText = "";
    if (req.startTime) timeText += ` เวลา ${req.startTime} น.`;
    if (req.endTime) timeText += ` ถึงเวลา ${req.endTime} น.`;

    if (req.type === 'Late' || req.type === 'OffCampus') {
        p1_request = `มีความประสงค์ขอ${getLeaveTypeName(req.type)} เนื่องจาก ${req.reason} ตั้งแต่วันที่ ${startDate} ${timeText} ถึงวันที่ ${endDate}`;
    } else {
        const count = stats.currentDays || 0;
        p1_request = `ขอลา${getLeaveTypeName(req.type)} เนื่องจาก ${req.reason} ตั้งแต่วันที่ ${startDate} ถึงวันที่ ${endDate} มีกำหนด ${count} วัน`;
    }
    currentY = drawParagraphContinuous(p1_request, currentY, false); 

    const lastStart = stats.lastLeave ? formatDateThaiStr(stats.lastLeave.startDate) : "....................";
    const lastEnd = stats.lastLeave ? formatDateThaiStr(stats.lastLeave.endDate) : "....................";
    const lastDays = stats.lastLeave ? stats.lastLeaveDays : "..."; 
    
    const p1_history = `ข้าพเจ้าได้ลาครั้งสุดท้ายตั้งแต่วันที่ ${lastStart} ถึงวันที่ ${lastEnd} มีกำหนด ${lastDays} วัน`;
    currentY = drawParagraphContinuous(p1_history, currentY, false);

    currentY -= (lineHeight * 0.5);

    const p2_contact = `ในระหว่างลาติดต่อข้าพเจ้าได้ที่ ${req.contactInfo || '-'} เบอร์โทรศัพท์ ${req.mobilePhone || '-'}`;
    currentY = drawParagraphContinuous(p2_contact, currentY, true); 

    const p5 = "จึงเรียนมาเพื่อโปรดพิจารณา";
    page.drawText(p5, { x: margin + indent, y: currentY - lineHeight, size: fontSize, font: thaiFont });
    currentY -= (lineHeight * 3);

    const blockCenterX = width - 120; 

    const closingLabel = "ขอแสดงความนับถือ";
    const closingLabelWidth = thaiFont.widthOfTextAtSize(closingLabel, fontSize);
    page.drawText(closingLabel, { x: blockCenterX - (closingLabelWidth / 2), y: currentY, size: fontSize, font: thaiFont });
    currentY -= 40; 

    if (teacherSignatureBase64) {
        try {
            const tSigBytes = dataURItoUint8Array(teacherSignatureBase64);
            let tSigImage;
            if (teacherSignatureBase64.toLowerCase().includes('png')) tSigImage = await pdfDoc.embedPng(tSigBytes);
            else tSigImage = await pdfDoc.embedJpg(tSigBytes);
            
            const tSigDim = tSigImage.scaleToFit(100, 40);
            page.drawImage(tSigImage, { x: blockCenterX - (tSigDim.width / 2), y: currentY, width: tSigDim.width, height: tSigDim.height });
        } catch(e) {
            console.warn("Could not embed teacher signature", e);
        }
    } else {
        const dotLine = "(.......................................................)";
        const dotWidth = thaiFont.widthOfTextAtSize(dotLine, fontSize);
        page.drawText(dotLine, { x: blockCenterX - (dotWidth / 2), y: currentY + 10, size: fontSize, font: thaiFont });
    }
    
    currentY -= 20;
    const teacherNameLine = `( ${teacher.name} )`;
    const tNameWidth = thaiFont.widthOfTextAtSize(teacherNameLine, fontSize);
    page.drawText(teacherNameLine, { x: blockCenterX - (tNameWidth / 2), y: currentY, size: fontSize, font: thaiFont });
    currentY -= lineHeight;
    const tPosLine = `ตำแหน่ง ${teacher.position}`;
    const tPosWidth = thaiFont.widthOfTextAtSize(tPosLine, fontSize);
    page.drawText(tPosLine, { x: blockCenterX - (tPosWidth / 2), y: currentY, size: fontSize, font: thaiFont });
    
    currentY -= (lineHeight * 2);

    const tableTop = currentY;
    const col1 = margin;
    const col2 = col1 + 60;
    const col3 = col2 + 60;
    const col4 = col3 + 60;
    
    const rowHeight = 20;
    const drawCell = (text: string, x: number, y: number, w: number) => {
        page.drawRectangle({ x, y: y - rowHeight + 5, width: w, height: rowHeight, borderColor: rgb(0,0,0), borderWidth: 0.5 });
        page.drawText(text, { x: x + 5, y: y - rowHeight + 10, size: 12, font: thaiFont });
    };

    page.drawText("สถิติการลาในปีงบประมาณนี้", { x: col1, y: tableTop + 10, size: 14, font: thaiFont });

    let rowY = tableTop - 10;
    drawCell("ประเภท", col1, rowY, 60);
    drawCell("ลามาแล้ว", col2, rowY, 60);
    drawCell("ลาครั้งนี้", col3, rowY, 60);
    drawCell("รวมเป็น", col4, rowY, 60);
    rowY -= rowHeight;

    const rows = [
        { name: "ป่วย", prev: stats.prevSick, curr: req.type === 'Sick' ? stats.currentDays : 0 },
        { name: "กิจส่วนตัว", prev: stats.prevPersonal, curr: req.type === 'Personal' ? stats.currentDays : 0 },
        { name: "คลอดบุตร", prev: stats.prevMaternity, curr: req.type === 'Maternity' ? stats.currentDays : 0 },
    ];
    
    if (req.type === 'Late' || req.type === 'OffCampus') {
         const isLate = req.type === 'Late';
         drawCell(isLate ? "สาย" : "ออกนอก", col1, rowY, 60);
         drawCell(`${isLate ? stats.prevLate : stats.prevOffCampus}`, col2, rowY, 60);
         drawCell("1", col3, rowY, 60);
         drawCell(`${(isLate ? stats.prevLate : stats.prevOffCampus) + 1}`, col4, rowY, 60);
    } else {
        rows.forEach(r => {
            drawCell(r.name, col1, rowY, 60);
            drawCell(`${r.prev}`, col2, rowY, 60);
            drawCell(`${r.curr > 0 ? r.curr : '-'}`, col3, rowY, 60);
            drawCell(`${r.prev + r.curr}`, col4, rowY, 60);
            rowY -= rowHeight;
        });
    }

    const dirX = width / 2 + 20;
    const dirBoxHeight = 160; 
    const dirBoxY = tableTop - dirBoxHeight + 20; 

    page.drawRectangle({ x: dirX, y: dirBoxY, width: 220, height: dirBoxHeight, borderColor: rgb(0,0,0), borderWidth: 0.5 });
    
    let dirTextY = dirBoxY + dirBoxHeight - 25; 
    const commentHeader = "ความเห็น / คำสั่ง";
    const commentW = thaiFont.widthOfTextAtSize(commentHeader, 14);
    page.drawText(commentHeader, { x: dirX + (220 - commentW)/2, y: dirTextY, size: 14, font: thaiFont, color: rgb(0,0,0) });
    dirTextY -= 25;

    // ตรวจสอบสถานะการอนุมัติแบบ Case-insensitive เผื่อความผิดพลาด
    const isApproved = req.status?.toLowerCase() === 'approved';
    const isRejected = req.status?.toLowerCase() === 'rejected';

    page.drawText(isApproved ? "[ / ] อนุญาต" : "[   ] อนุญาต", { x: dirX + 20, y: dirTextY, size: 14, font: thaiFont });
    dirTextY -= 20;
    page.drawText(isRejected ? "[ / ] ไม่อนุมัติ" : "[   ] ไม่อนุมัติ", { x: dirX + 20, y: dirTextY, size: 14, font: thaiFont });
    dirTextY -= 30; 

    if (isApproved && directorSignatureBase64) {
        try {
            const dSigBytes = dataURItoUint8Array(directorSignatureBase64);
            let dSigImage;
            
            // พยายามโหลด PNG ก่อน ถ้าล้มเหลวให้ลอง JPG
            try {
                if (directorSignatureBase64.toLowerCase().includes('png')) {
                    dSigImage = await pdfDoc.embedPng(dSigBytes);
                } else {
                    dSigImage = await pdfDoc.embedJpg(dSigBytes);
                }
            } catch (embedError) {
                // Fallback attempt
                try {
                    dSigImage = await pdfDoc.embedPng(dSigBytes);
                } catch {
                    dSigImage = await pdfDoc.embedJpg(dSigBytes);
                }
            }

            if (dSigImage) {
                const scale = options.directorSignatureScale || 1;
                const dSigDim = dSigImage.scaleToFit(80 * scale, 40 * scale);
                const yOffset = options.directorSignatureYOffset || 0;
                page.drawImage(dSigImage, { x: dirX + (220 - dSigDim.width)/2, y: dirTextY + yOffset, width: dSigDim.width, height: dSigDim.height });
            }
        } catch(e) {
            console.error("PDF: Director signature embed failed", e);
        }
    } 
    
    dirTextY -= 20;
    const dirNameLine = `( ${directorName} )`;
    const dNameWidth = thaiFont.widthOfTextAtSize(dirNameLine, 14);
    page.drawText(dirNameLine, { x: dirX + (220 - dNameWidth)/2, y: dirTextY, size: 14, font: thaiFont });
    dirTextY -= 15;
    const dPosLine = "ตำแหน่ง ผู้อำนวยการโรงเรียน";
    const dPosWidth = thaiFont.widthOfTextAtSize(dPosLine, 14);
    page.drawText(dPosLine, { x: dirX + (220 - dPosWidth)/2, y: dirTextY, size: 14, font: thaiFont });
    dirTextY -= 15;
    const approveDate = req.approvedDate ? formatDateThaiStr(req.approvedDate) : ".....................................";
    const dDateLine = `วันที่ ${approveDate}`;
    const dDateWidth = thaiFont.widthOfTextAtSize(dDateLine, 14);
    page.drawText(dDateLine, { x: dirX + (220 - dDateWidth)/2, y: dirTextY, size: 14, font: thaiFont });

    return await pdfDoc.saveAsBase64({ dataUri: true });
};

// --- SUMMARY REPORT PDF ---

interface SummaryPdfOptions {
    schoolName: string;
    startDate: string;
    endDate: string;
    teachers: any[];
    getStatsFn: (teacherId: string, start: string, end: string) => any;
    directorName: string;
    officialGarudaBase64?: string;
    directorSignatureBase64?: string;
    directorSignatureScale?: number;
    directorSignatureYOffset?: number;
}

export const generateLeaveSummaryPdf = async (options: SummaryPdfOptions): Promise<string> => {
    const { schoolName, startDate, endDate, teachers, getStatsFn, directorName, officialGarudaBase64, directorSignatureBase64, directorSignatureScale = 1, directorSignatureYOffset = 0 } = options;

    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit as any);
    const fontBytes = await fetchThaiFont();
    const thaiFont = await pdfDoc.embedFont(fontBytes);

    let page = pdfDoc.addPage([595.28, 841.89]);
    const { width, height } = page.getSize();
    let curY = height - 50;

    // Header with Garuda
    if (officialGarudaBase64) {
        try {
            const garuda = await pdfDoc.embedPng(dataURItoUint8Array(officialGarudaBase64));
            const gDim = garuda.scaleToFit(60, 60);
            page.drawImage(garuda, { x: 50, y: curY - 60, width: gDim.width, height: gDim.height });
        } catch (e) {}
    }
    
    page.drawText("บันทึกข้อความ", { x: 240, y: curY - 45, size: 24, font: thaiFont });
    curY -= 80;

    const headerFontSize = 16;
    page.drawText(`ส่วนราชการ  ${schoolName}`, { x: 50, y: curY, size: headerFontSize, font: thaiFont });
    curY -= 25;
    page.drawText(`ที่  .................................................................`, { x: 50, y: curY, size: headerFontSize, font: thaiFont });
    const dateText = `วันที่  ${formatDateThai(new Date(), true)}`; 
    page.drawText(dateText, { x: 300, y: curY, size: headerFontSize, font: thaiFont });
    curY -= 25;
    
    const startThai = formatDateThaiStr(startDate, true);
    const endThai = formatDateThaiStr(endDate, true);
    page.drawText(`เรื่อง  สรุปสถิติการลาของบุคลากร ระหว่างวันที่ ${startThai} ถึงวันที่ ${endThai}`, { x: 50, y: curY, size: headerFontSize, font: thaiFont });
    curY -= 35;

    page.drawText(`เรียน  บุคลากรทางการศึกษา${schoolName}`, { x: 50, y: curY, size: headerFontSize, font: thaiFont });
    curY -= 30;
    
    const cmToPoints = 28.35;
    const indentPoints = 2.5 * cmToPoints; // 2.5 cm indentation
    const margin = 50;
    const contentWidth = width - (2 * margin);

    const intro = `ตามที่ ${schoolName} จะดำเนินการประเมินประสิทธิภาพและประสิทธิผลการปฏิบัติงานของข้าราชการครูและบุคลากรทางการศึกษา เพื่อประกอบการพิจารณาเลื่อนเงินเดือน (${startThai} ถึง ${endThai}) ในการนี้ เพื่อให้การดำเนินการเป็นไปด้วยความเรียบร้อยและถูกต้องตามระเบียบ ก.ค.ศ. ว่าด้วยการเลื่อนเงินเดือน นั้น จึงขอแจ้งสรุปสถิติการลาประเภทต่างๆ เพื่อให้บุคลากรได้ตรวจสอบความถูกต้องของข้อมูลตนเอง ดังนี้`;
    
    let wordsArr = intro.split('');
    let firstLine = "";
    let i = 0;
    while(i < wordsArr.length) {
        const test = firstLine + wordsArr[i];
        if (thaiFont.widthOfTextAtSize(test, 14) < (contentWidth - indentPoints)) {
            firstLine += wordsArr[i];
            i++;
        } else break;
    }
    
    page.drawText(firstLine, { x: margin + indentPoints, y: curY, size: 14, font: thaiFont });
    curY -= 20;

    const remainingText = wordsArr.slice(i).join('');
    const subsequentLines = splitTextIntoLines(remainingText, contentWidth, 14, thaiFont);
    subsequentLines.forEach(l => {
        page.drawText(l, { x: margin, y: curY, size: 14, font: thaiFont });
        curY -= 20;
    });
    curY -= 15;

    const colX = [50, 80, 250, 290, 330, 370, 410, 450];
    const tableHeaders = ["ที่", "ชื่อ-นามสกุล", "ป่วย", "กิจ", "ลอด", "สาย", "นอก", "ลงชื่อรับทราบ"];
    
    const drawTableHeader = (y: number) => {
        page.drawRectangle({ x: 50, y: y - 5, width: width - 100, height: 25, color: rgb(0.95, 0.95, 0.95), borderColor: rgb(0,0,0), borderWidth: 1 });
        tableHeaders.forEach((h, i) => {
            page.drawText(h, { x: colX[i] + 5, y, size: 12, font: thaiFont });
        });
    };

    drawTableHeader(curY);
    curY -= 25;

    teachers.forEach((t, idx) => {
        if (curY < 150) { 
            page = pdfDoc.addPage([595.28, 841.89]);
            curY = height - 50;
            drawTableHeader(curY);
            curY -= 25;
        }

        const s = getStatsFn(t.id, startDate, endDate);
        const rowData = [
            toThaiDigits(idx + 1),
            t.name,
            toThaiDigits(s.sick),
            toThaiDigits(s.personal),
            toThaiDigits(s.maternity),
            toThaiDigits(s.late),
            toThaiDigits(s.offCampus),
            ".............................."
        ];

        page.drawRectangle({ x: 50, y: curY - 5, width: width - 100, height: 25, borderColor: rgb(0,0,0), borderWidth: 0.5 });
        rowData.forEach((d, i) => {
            page.drawText(d, { x: colX[i] + 5, y: curY, size: 11, font: thaiFont });
        });
        curY -= 25;
    });

    curY -= 60;
    if (curY < 150) {
        page = pdfDoc.addPage([595.28, 841.89]);
        curY = height - 100;
    }

    const footerX = 320;
    if (directorSignatureBase64) {
        try {
            const dSigBytes = dataURItoUint8Array(directorSignatureBase64);
            let dSigImage;
            try {
                dSigImage = await pdfDoc.embedPng(dSigBytes);
            } catch {
                dSigImage = await pdfDoc.embedJpg(dSigBytes);
            }
            
            if (dSigImage) {
                const dDim = dSigImage.scaleToFit(100 * directorSignatureScale, 45 * directorSignatureScale);
                page.drawImage(dSigImage, { x: footerX + 40, y: curY + directorSignatureYOffset + 10, width: dDim.width, height: dDim.height });
            }
        } catch (e) {}
    }
    
    page.drawText(`(ลงชื่อ).................................................`, { x: footerX, y: curY - 15, size: 14, font: thaiFont });
    page.drawText(`(${directorName})`, { x: footerX + 40, y: curY - 35, size: 14, font: thaiFont });
    const posTextFooter = `ผู้อำนวยการ${schoolName || '...................'}`;
    page.drawText(posTextFooter, { x: footerX + 25, y: curY - 55, size: 14, font: thaiFont });

    return await pdfDoc.saveAsBase64({ dataUri: true });
};
