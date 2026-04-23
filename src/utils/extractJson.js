function extractJsonFromText(text = '') {
    const cleaned = text
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();

    return cleaned;
}

module.exports = { extractJsonFromText };