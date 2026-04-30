import os

# Configuration
SOURCE_DIR = r"D:\.code\ecodiaos\backend"
OUTPUT_FILE = r"D:\ecodiaos_full_context.txt"

# Folders and file extensions to ignore to save context space
IGNORE_DIRS = {'.git', 'node_modules', '__pycache__', 'venv', '.venv', 'dist', 'build'}
ALLOWED_EXTENSIONS = {'.py', '.js', '.ts', '.json', '.env.example', '.md', '.yml', '.yaml', '.sh'}

def collate_code():
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as outfile:
        for root, dirs, files in os.walk(SOURCE_DIR):
            # Modify dirs in-place to skip ignored directories
            dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]

            for file in files:
                ext = os.path.splitext(file)[1].lower()
                if ext in ALLOWED_EXTENSIONS:
                    file_path = os.path.join(root, file)
                    try:
                        with open(file_path, 'r', encoding='utf-8') as infile:
                            content = infile.read()
                            outfile.write(f"\n{'='*60}\n")
                            outfile.write(f"FILE: {file_path}\n")
                            outfile.write(f"{'='*60}\n\n")
                            outfile.write(content)
                            outfile.write("\n")
                    except Exception as e:
                        outfile.write(f"\n[Could not read file {file_path}: {e}]\n")

    print(f"Done! Code collated into: {OUTPUT_FILE}")

if __name__ == "__main__":
    collate_code()
