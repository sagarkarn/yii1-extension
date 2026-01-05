export const COMMENT_REGEX = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(\/\/.*|\/\*[\s\S]*?\*\/)/g;
export const RENDER_PATTERN_REGEX = /(?:->|::)\s*(render(?:Partial)?)\s*\(\s*['"]([^'"]+)['"]/g;
export const URL_PATTERN_REGEX = /(?:->|::)\s*create(?:Absolute)?Url\s*\(\s*['"]([^'"]+)['"]/g;
export const CLASS_PATTERN_REGEX = /['"]class['"]\s*=>\s*['"]([^'"]+)['"]/g;
export const BEHAVIORS_PATTERN_REGEX = /(?:public\s+)?function\s+behaviors\s*\([^)]*\)\s*\{/gi;
export const METHOD_PATTERN_REGEX = /(?:public|protected|private)?\s*(?:static\s+)?function\s+(\w+)\s*\(/g;
export const PROPERTY_PATTERN_REGEX = /(?:public|protected|private)\s+(?:static\s+)?\$(\w+)/g;