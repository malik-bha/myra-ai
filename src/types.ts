export type AppMode = 'GENERAL' | 'WEB_APP' | 'MYRA';

export interface Message {
  id: string;
  text: string;
  sender: 'ai' | 'user';
  timestamp: Date;
  type?: 'text' | 'image' | 'code';
  code?: string;
  imageUrl?: string;
}

export interface CodeSnippet {
  id: string;
  name: string;
  html: string;
  timestamp: Date;
}
