import crypto from 'crypto';

export function hashCode(str: string): string {
    const MAX_LENGTH = 7;

    // Use SHA-256 as the hash function
    const hash = crypto.createHash('sha256').update(str).digest();

    // Compress the hash value to a string of MAX_LENGTH characters
    let compressed = '';
    for (let i = 0; i < MAX_LENGTH; i++) {
        const byte = hash[i % hash.length];
        const charCode = byte % 26 + (byte < 128 ? 97 : 65); // Use lowercase letters for bytes < 128, and uppercase letters otherwise
        compressed += String.fromCharCode(charCode);
    }

    // If the compressed string is shorter than MAX_LENGTH, repeat it until it reaches MAX_LENGTH
    let uniqueString = '';
    while (uniqueString.length < MAX_LENGTH) {
        uniqueString += compressed;
    }

    // Truncate the unique string to MAX_LENGTH characters
    uniqueString = uniqueString.substring(0, MAX_LENGTH);

    // Add an offset based on the position of the first character to add variation and avoid starting with a number
    const offset = uniqueString.charCodeAt(0) % 10;
    uniqueString = uniqueString.split('').map((char, index) => String.fromCharCode((char.charCodeAt(0) + index + offset) % 256)).join('');

    return uniqueString;
}

export function safeString(str: string): string {
    return str.replace(/[^a-zA-Z0-9_$]/g, (match) => {
        const charCode = match.charCodeAt(0);
        const code = charCode.toString().split('').reduce((acc, digit) => acc + parseInt(digit), 0);
        return String.fromCharCode((code % 26) + 97); // Replace illegal characters with lowercase letters
    });
}

export function hashId(str: string) {
    return safeString(hashCode(str));
}
