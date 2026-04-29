/**
 * This function extracts prerequisite course codes from a course description string.
 * It uses regular expressions (regex) to search for patterns like "CSCI 23500".
 * 
 * TypeScript Note: 
 * - 'string | null | undefined' means the input can be a string, or it might be missing.
 * - 'string[]' means the function returns an array of strings.
 */
export function parsePrereqs(description: string | null | undefined): string[] {
  // If description is null, undefined, or an empty string, return an empty array []
  if (!description) return [];

  /**
   * 1. FIND THE PREREQUISITE SECTION
   * 
   * Regex breakdown: /(?:prerequisites?|prereqs?)\s*:\s*(.*?)(?:\.|$)/is
   * - (?:...) : Non-capturing group (groups terms without "remembering" them)
   * - prerequisites?|prereqs? : Matches "prerequisite", "prerequisites", "prereq", or "prereqs"
   * - \s*:\s* : Matches a colon with any amount of whitespace around it
   * - (.*?) : Capturing group 1. The '?' makes it "lazy", so it stops at the first period
   * - (?:\.|$) : Stops at a literal period '.' or the end of the string '$'
   * - /is : 'i' makes it case-insensitive, 's' allows '.' to match newlines
   */
  const prereqMatch = description.match(
    /(?:prerequisites?|prereqs?)\s*:\s*(.*?)(?:\.|$)/is
  );

  // If we didn't find a "Prerequisites:" section, stop and return nothing
  if (!prereqMatch) return [];

  // prereqMatch[1] contains the text caught by our (.*?) capturing group
  const prereqText = prereqMatch[1];

  /**
   * 2. EXTRACT INDIVIDUAL COURSE CODES
   * 
   * Regex breakdown: /\b([A-Z]{2,5})\s+(\d{3,5})\b/g
   * - \b : Word boundary (ensures we don't match middle of words)
   * - ([A-Z]{2,5}) : 2 to 5 uppercase letters (e.g., "CSCI", "MATH")
   * - \s+ : One or more whitespace characters
   * - (\d{3,5}) : 3 to 5 digits (e.g., "150", "23500")
   * - /g : "Global" flag - finds ALL matches in the text, not just the first one
   */
  const courseCodePattern = /\b([A-Z]{2,5})\s+(\d{3,5})\b/g;
  const codes: string[] = [];
  let match: RegExpExecArray | null;

  // Use a while loop to find every occurrence of the course code pattern
  while ((match = courseCodePattern.exec(prereqText)) !== null) {
    // match[1] is the letters, match[2] is the numbers
    // We combine them with a space and add to our list
    codes.push(`${match[1]} ${match[2]}`);
  }

  /**
   * 3. DEDUPLICATE AND RETURN
   * 
   * 'new Set(codes)' creates a collection of unique values.
   * '[... ]' (spread operator) converts that Set back into a normal Array.
   */
  return [...new Set(codes)];
}
