const WARNING_COMMENT = '/********************************\n\t Hey devs! This file was lovingly crafted by the design team and automatically synced through GitHub.\n\t Be careful about making any changes, as they may be overwritten next time this is synced!\n\t If you need to extend this file, it\'s reccommended that you create an additional CSS file and reference these values there.\n********************************/\n\n';
const CSS_FILE_FORMAT = 'CSS';

const variablePrefixes = {
    css: '--',
    scss: '$',
    less: '@',
    styl: ''
};

const variableSuffixes = {
    css: ': ',
    scss: ': ',
    less: ': ',
    styl: ' = '
};

const lineSuffixes = {
    css: ';\n',
    scss: ';\n',
    less: ';\n',
    styl: '\n'
};

const gradientTypes = {
    "Style.GradientType.Linear": 'linear',
    "Style.GradientType.Radial": 'radial'
};

function convertToStyleVariable(format, name, value) {
    return `${variablePrefixes[format]}${convertToKebabAndNormalize(name)}${variableSuffixes[format]}${value}${lineSuffixes[format]}`
}

function convertToKebabAndNormalize(string) {
    const lowercase = string.toLowerCase().replaceAll(/[^A-Za-z ]/g, '');

    return lowercase.replaceAll(/\s/g, '-');
}

// TODO: currently, gradients don't seem to be populated at the document level, so this is blank... needs investigation
// Also, this code always produces gradients with an orientation at the center. Needs a position, probably in terms of percentage?
function convertToCssGradient(gradient) {
    const stops = gradient.stops
        .map(stop => getStopValue(stop, gradient))
        .join(', ');

    return `${gradientTypes[gradient.gradientType]}-gradient(${getAngleIfNeeded(gradient)}${stops})`;
}

function getStopValue(stop, gradient) {
    return gradient.gradientType == 'Style.GradientType.Linear' ?
        `${stop.color} ${stop.position * 100}%` :
        stop.color;
}

function getAngle(gradient) {
    const opposite = gradient.from.y + gradient.to.y;
    const adjacent = gradient.from.x + gradient.to.x;

    return Math.atan(opposite / adjacent) * 180 / Math.PI;
}

function getAngleIfNeeded(gradient) {
    return gradient.gradientType === 'Style.GradientType.Linear' ?
        `${getAngle(gradient)}deg, ` :
        '';
}

// TODO: break this up
export function getConvertedContents(doc, format) {
    const colors = doc.swatches.map(color => convertToStyleVariable(format, color.name, color.color));

    const gradients = doc.gradients.map(gradient => convertToStyleVariable(format, gradient.name, convertToCssGradient(gradient.gradient)));

    let fileContents = `/* Colors */\n${colors.join('')}\n/* Gradients */\n${gradients.join('')}`

    if (format === 'css') {
        fileContents = `:root{\n\t${fileContents.replaceAll('\n', '\n\t')}\n}`;
    }

    fileContents = `${WARNING_COMMENT}${fileContents}\n`

    return fileContents;
}

export function getFileFormat(filePath) {
	const format = filePath.substring(filePath.lastIndexOf('.') + 1).toLowerCase();
  
  if (!Object.keys(variablePrefixes).includes(format)) {
  	throw `unrecognized file format '${format}'!`;
  }
  
  return format;
}