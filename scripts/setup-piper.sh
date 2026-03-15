#!/bin/bash
set -e

echo "Installing Piper TTS..."
pip install piper-tts

echo "Downloading en_US-lessac-medium voice model..."
python3 -m piper.download --model en_US-lessac-medium --output-dir ~/.local/share/piper/models

echo "Piper ready!"
echo ""
echo "To use a different voice, run:"
echo "  python3 -m piper.download --model <voice-name> --output-dir ~/.local/share/piper/models"
echo "  Then set TTS_VOICE=<voice-name> in your .env"
echo ""
echo "Browse available voices: https://huggingface.co/rhasspy/piper-voices/tree/main"
