export interface SourceLoc {
  file: string;
  line: number;
  column: number;
}

export type NodeKind = 'signal' | 'memo' | 'effect';

export interface RegisterEvent {
  type: 'register';
  id: string;
  name: string;
  kind: NodeKind;
  value?: any;
  loc?: SourceLoc | null;
  component?: string | null;
}

export interface ReadEvent {
  type: 'read';
  id: string;
  value: any;
}

export interface WriteEvent {
  type: 'write';
  id: string;
  value: any;
}

export interface LinkEvent {
  type: 'link';
  fromId: string;
  toId: string;
}

export interface UnlinkEvent {
  type: 'unlink';
  fromId: string;
  toId: string;
}

export interface UpdateEvent {
  type: 'update';
  id: string;
  value?: any;
  duration: number;
}

export interface DestroyEvent {
  type: 'destroy';
  id: string;
  component?: string | null;
}

export type TraceEvent =
  | RegisterEvent
  | ReadEvent
  | WriteEvent
  | LinkEvent
  | UnlinkEvent
  | UpdateEvent
  | DestroyEvent;
