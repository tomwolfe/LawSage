import re

def format_to_pleading(text: str) -> str:
    """
    Formats the given text into a 28-line numbered pleading format
    standard for U.S. District Courts.
    """
    # Split the text into lines
    lines = text.splitlines()
    
    formatted_lines = []
    line_counter = 1
    
    # Standard pleading header/footer could be added here
    # For now, we'll just wrap the content with line numbers
    
    for line in lines:
        if not line.strip() and line_counter > 28:
            # Optionally reset counter every page, but for simple text export
            # we'll just keep it going or wrap at 28
            pass
            
        # If line is too long, we should ideally wrap it, 
        # but for this utility we'll assume basic wrapping
        
        # Format: "1 | [Line text]"
        # "2 | ..."
        
        num_str = f"{line_counter:2} | "
        formatted_lines.append(num_str + line)
        
        line_counter += 1
        if line_counter > 28:
            line_counter = 1
            formatted_lines.append("-" * 40) # Page break indicator
            
    return "\n".join(formatted_lines)
