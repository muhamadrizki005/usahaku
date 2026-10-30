import { ComponentType, ElementType, ReactNode } from 'react';

export interface TextTypeProps {
  text: string | string[];
  as?: ElementType;
  prefix?: string;
  prefixColor?: string;
  typingSpeed?: number;
  initialDelay?: number;
  pauseDuration?: number;
  deletingSpeed?: number;
  deleteMode?: 'backspace' | 'select';
  loop?: boolean;
  className?: string;
  showCursor?: boolean;
  hideCursorWhileTyping?: boolean;
  cursorStyle?: 'character' | 'bar' | 'block' | 'underscore';
  cursorCharacter?: string | ReactNode;
  cursorColor?: string;
  cursorClassName?: string;
  cursorBlinkDuration?: number;
  cursorGlide?: boolean;
  typeEffect?: 'none' | 'fade' | 'blur' | 'rise';
  mistakes?: number;
  textColors?: string[];
  variableSpeed?: { min: number; max: number };
  onSentenceComplete?: (sentence: string, index: number) => void;
  startOnVisible?: boolean;
  reverseMode?: boolean;
  [key: string]: any;
}

declare const TextType: ComponentType<TextTypeProps>;
export default TextType;

