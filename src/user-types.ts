/** User directory paths and account view shape shared by server and client types. */
export type UserDirectoryList = {
    root: string; thumbnails: string; thumbnailsAvatar: string; worlds: string; avatars: string;
    userImages: string; chats: string; characters: string; backgrounds: string; openAI_Settings: string;
    assets: string; files: string; backups: string; storage: string;
};

export type UserViewModel = {
    handle: string; name: string; avatar: string; admin?: boolean; password: boolean; enabled?: boolean; created?: number;
};
