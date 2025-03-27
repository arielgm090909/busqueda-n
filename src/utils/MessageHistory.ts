interface Message {
    role: 'user' | 'assistant';
    content: string;
    imageContext?: string;
}

export class MessageHistory {
    private history: Map<string, Message[]> = new Map();
    private lastImage: Map<string, string> = new Map();
    private systemPrompts: Map<string, string> = new Map();
    private chatEnabled: Map<string, boolean> = new Map();
    
    addMessage(userId: string, role: 'user' | 'assistant', content: string) {
        if (!this.history.has(userId)) {
            this.history.set(userId, []);
        }
        this.history.get(userId)?.push({ role, content });
    }

    getHistory(userId: string, windowSize: number): Message[] {
        const userHistory = this.history.get(userId) || [];
        return userHistory.slice(-windowSize);
    }
 
    clearHistory(userId: string) {
        this.history.delete(userId);
    }

    setLastImage(userId: string, imagePath: string) {
        this.lastImage.set(userId, imagePath);
    }

    getLastImage(userId: string): string | undefined {
        return this.lastImage.get(userId);
    }

    removeLastImage(userId: string) {
        this.lastImage.delete(userId);
    }

    setSystemPrompt(userId: string, prompt: string) {
        this.systemPrompts.set(userId, prompt);
    }

    getSystemPrompt(userId: string): string | undefined {
        return this.systemPrompts.get(userId);
    }

    setChatEnabled(userId: string, enabled: boolean) {
        this.chatEnabled.set(userId, enabled);
    }

    isChatEnabled(userId: string): boolean {
        return this.chatEnabled.get(userId) ?? true; // Por defecto el chat está activado
    }

    resetUserChat(userId: string) {
        this.clearHistory(userId);
        this.removeLastImage(userId);
        // Removemos esta línea para mantener el prompt:
        // this.systemPrompts.delete(userId);
        // No eliminamos el estado del chat al resetear
    }
}
