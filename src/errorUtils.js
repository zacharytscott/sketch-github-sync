import sketch from 'sketch';

export function handleError(message) {
    sketch.UI.alert('An error occurred', message);
}