// Utility for sending Telegram Notifications with rich formatting
import { supabase } from '../supabaseClient';

interface SendMessagePayload {
    chat_id: string;
    text: string;
    parse_mode?: 'HTML' | 'Markdown';
    disable_web_page_preview?: boolean;
}

/**
 * Sends a formatted message to a Telegram chat.
 * Supports HTML tags like <b>, <i>, <a>, <code>, <pre>
 */
export const notifyGuardianSavings = async (
    botToken: string,
    studentId: string,
    studentName: string,
    amount: number,
    type: 'DEPOSIT' | 'WITHDRAWAL',
    totalBalance: number,
    schoolName: string
) => {
    if (!supabase || !botToken) return;

    try {
        const { data: refs } = await supabase
            .from('guardian_telegram_refs')
            .select('chat_id')
            .eq('student_id', studentId);

        if (!refs || refs.length === 0) return;

        const typeLabel = type === 'DEPOSIT' ? 'ฝากเงิน' : 'ถอนเงิน';
        const typeEmoji = type === 'DEPOSIT' ? '💰' : '💸';
        
        const now = new Date();
        const bangkokTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
        
        const message = `<b>🔔 แจ้งเตือนรายการออมทรัพย์ (${schoolName})</b>\n\n` +
            `👤 นักเรียน: <b>${studentName}</b>\n` +
            `📝 รายการ: ${typeEmoji} <b>${typeLabel}</b>\n` +
            `💵 จำนวนเงิน: <b>${amount.toLocaleString()} บาท</b>\n` +
            `🏦 ยอดเงินคงเหลือ: <b>${totalBalance.toLocaleString()} บาท</b>\n\n` +
            `<i>บันทึกข้อมูลเมื่อ: ${bangkokTime.toLocaleDateString('th-TH', { 
                day: 'numeric', 
                month: 'long', 
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            })} น.</i>`;

        for (const ref of refs) {
            await sendTelegramMessage(botToken, ref.chat_id, message);
        }
    } catch (error) {
        console.error("Error in notifyGuardianSavings:", error);
    }
};

export const notifyGuardianAttendance = async (
    botToken: string, 
    studentId: string, 
    studentName: string, 
    dateThai: string, 
    status: string,
    schoolName: string
) => {
    if (!supabase || !botToken) return;

    try {
        const { data: refs } = await supabase
            .from('guardian_telegram_refs')
            .select('chat_id')
            .eq('student_id', studentId);

        if (!refs || refs.length === 0) return;

        const statusEmoji = status === 'มาเรียน' ? '✅' : status === 'สาย' ? '⏰' : status === 'ลาป่วย/ธุระ' ? '🤒' : '❌';
        const message = `<b>🔔 แจ้งเตือนการมาเรียน (${schoolName})</b>\n\n` +
            `👤 นักเรียน: <b>${studentName}</b>\n` +
            `📅 วันที่: ${dateThai}\n` +
            `📊 สถานะ: ${statusEmoji} <b>${status}</b>\n\n` +
            `<i>ขอบคุณที่ไว้วางใจให้เราดูแลบุตรหลานของท่าน</i>`;

        for (const ref of refs) {
            await sendTelegramMessage(botToken, ref.chat_id, message);
        }
    } catch (error) {
        console.error("Error in notifyGuardianAttendance:", error);
    }
};

export const sendTelegramMessage = async (botToken: string, chatId: string, message: string, deepLinkUrl?: string) => {
    if (!botToken || !chatId) {
        console.warn("Telegram Bot Token or Chat ID is missing. Notification skipped.");
        return;
    }

    let finalMessage = message;
    
    // Add an action button-like link if provided
    if (deepLinkUrl) {
        finalMessage += `\n\n<b>🔗 ดำเนินการต่อในระบบ:</b>\n<a href="${deepLinkUrl}">คลิกที่นี่เพื่อเปิดแอปและลงชื่อรับทราบ</a>`;
    }

    const payload: SendMessagePayload = {
        chat_id: chatId,
        text: finalMessage,
        parse_mode: 'HTML',
        disable_web_page_preview: false
    };

    try {
        const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const responseText = await response.text();
        let data;
        try {
            data = JSON.parse(responseText);
        } catch (e) {
            console.error("Telegram API returned invalid JSON:", responseText);
            return;
        }
        
        if (!data.ok) {
            console.error("Telegram API Error Response:", data);
        } else {
            console.log("Telegram notification sent successfully to chat:", chatId);
        }
    } catch (error) {
        console.error("Failed to send Telegram message fetch error:", error);
    }
};
