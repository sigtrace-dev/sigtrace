import { toSignal as originalToSignal } from '@angular/core/rxjs-interop';
import { Observable } from 'rxjs';
import { client } from '../index.js';
import { recordRead } from './angular.js';

export * from '@angular/core/rxjs-interop';

export function toSignal<T>(observable: Observable<T>, options?: any) {
  const signalId = `signal_${Math.random().toString(36).substring(2, 9)}`;
  const name = options?.name || `toSignal_${signalId.substring(7)}`;

  // Send register event
  client.send({
    type: 'register',
    id: signalId,
    name,
    kind: 'signal',
    value: options?.initialValue,
    loc: options?.__source || null,
    component: options?.component || null
  });

  // Intercept Observable emissions to track writes
  const interceptedObservable = new Observable<T>((subscriber) => {
    const subscription = observable.subscribe({
      next(value) {
        client.send({
          type: 'write',
          id: signalId,
          value: value
        });
        subscriber.next(value);
      },
      error(err) {
        subscriber.error(err);
      },
      complete() {
        subscriber.complete();
      }
    });
    return () => subscription.unsubscribe();
  });

  const originalSig = originalToSignal(interceptedObservable as any, options);

  const trackedSignal = (() => {
    recordRead(signalId);
    return originalSig();
  }) as any;

  return trackedSignal;
}
