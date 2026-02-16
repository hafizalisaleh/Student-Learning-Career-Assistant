'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, MicOff, PhoneOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

interface VoiceChatProps {
  documentId?: string;
  onTranscript?: (text: string) => void;
  onResponse?: (text: string) => void;
}

export function VoiceChat({ documentId, onTranscript, onResponse }: VoiceChatProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'speaking' | 'listening'>('idle');
  const [transcript, setTranscript] = useState('');

  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<AudioBuffer[]>([]);
  const isPlayingRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);

  // Get auth token from localStorage
  const getToken = () => {
    if (typeof window === 'undefined') return null;
    const storage = localStorage.getItem('auth-storage');
    if (storage) {
      const { state } = JSON.parse(storage);
      return state?.token;
    }
    return null;
  };

  // Connect to voice WebSocket
  const connect = useCallback(async () => {
    const token = getToken();
    if (!token) {
      toast.error('Please login to use voice chat');
      return;
    }

    setStatus('connecting');

    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;

      // Create WebSocket connection
      const wsUrl = `${process.env.NEXT_PUBLIC_API_URL?.replace('http', 'ws') || 'ws://localhost:8000'}/api/voice/ws/${token}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('Voice WebSocket connected');
        ws.send(JSON.stringify({
          type: 'start',
          document_id: documentId || null,
        }));
      };

      ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case 'status':
            if (data.data === 'connected') {
              setIsConnected(true);
              setStatus('connected');
              toast.success('Voice chat connected');
              startRecording();
            } else if (data.data === 'disconnected') {
              setIsConnected(false);
              setStatus('idle');
            }
            break;

          case 'audio':
            await playAudioChunk(data.data);
            setStatus('speaking');
            break;

          case 'text':
            setTranscript(data.data);
            onResponse?.(data.data);
            break;

          case 'turn_complete':
            setStatus('listening');
            break;

          case 'error':
            console.error('Voice error:', data.data);
            toast.error(data.data);
            break;
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        toast.error('Voice connection error');
        disconnect();
      };

      ws.onclose = () => {
        console.log('Voice WebSocket closed');
        setIsConnected(false);
        setStatus('idle');
      };

    } catch (error: any) {
      console.error('Failed to connect voice:', error);
      toast.error(error.message || 'Failed to start voice chat');
      setStatus('idle');
    }
  }, [documentId, onResponse]);

  // Start recording audio
  const startRecording = useCallback(() => {
    if (!streamRef.current) return;

    try {
      const mediaRecorder = new MediaRecorder(streamRef.current, {
        mimeType: 'audio/webm;codecs=opus',
      });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN && !isMuted) {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64 = (reader.result as string).split(',')[1];
            wsRef.current?.send(JSON.stringify({
              type: 'audio',
              data: base64,
            }));
          };
          reader.readAsDataURL(event.data);
        }
      };

      mediaRecorder.start(250);
      setIsRecording(true);
      setStatus('listening');

    } catch (error) {
      console.error('Failed to start recording:', error);
    }
  }, [isMuted]);

  // Play audio chunk from server
  const playAudioChunk = async (base64Audio: string) => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext({ sampleRate: 24000 });
      }

      const audioData = Uint8Array.from(atob(base64Audio), c => c.charCodeAt(0));

      const audioBuffer = audioContextRef.current.createBuffer(1, audioData.length / 2, 24000);
      const channelData = audioBuffer.getChannelData(0);

      for (let i = 0; i < audioData.length; i += 2) {
        const sample = (audioData[i] | (audioData[i + 1] << 8));
        const signedSample = sample > 32767 ? sample - 65536 : sample;
        channelData[i / 2] = signedSample / 32768;
      }

      audioQueueRef.current.push(audioBuffer);
      playNextInQueue();

    } catch (error) {
      console.error('Failed to play audio:', error);
    }
  };

  // Play queued audio
  const playNextInQueue = () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) return;
    if (!audioContextRef.current) return;

    isPlayingRef.current = true;
    const buffer = audioQueueRef.current.shift()!;

    const source = audioContextRef.current.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContextRef.current.destination);
    source.onended = () => {
      isPlayingRef.current = false;
      playNextInQueue();
    };
    source.start();
  };

  // Disconnect voice chat
  const disconnect = useCallback(() => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.send(JSON.stringify({ type: 'end' }));
      wsRef.current.close();
      wsRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    setIsConnected(false);
    setIsRecording(false);
    setStatus('idle');
    setTranscript('');
  }, []);

  // Toggle mute
  const toggleMute = () => {
    setIsMuted(!isMuted);
    if (streamRef.current) {
      streamRef.current.getAudioTracks().forEach(track => {
        track.enabled = isMuted;
      });
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return (
    <div className="card p-6">
      <div className="flex flex-col items-center gap-4">
        {/* Status */}
        <div className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium',
          status === 'idle' && 'bg-[var(--bg-secondary)] text-[var(--text-secondary)]',
          status === 'connecting' && 'bg-[var(--warning-bg)] text-[var(--warning)]',
          status === 'connected' && 'bg-[var(--success-bg)] text-[var(--success)]',
          status === 'speaking' && 'bg-[var(--info-bg)] text-[var(--info)]',
          status === 'listening' && 'bg-[var(--success-bg)] text-[var(--success)]'
        )}>
          <div className={cn(
            'w-2 h-2 rounded-full',
            status === 'idle' && 'bg-[var(--text-muted)]',
            status === 'connecting' && 'bg-[var(--warning)] animate-pulse',
            status === 'connected' && 'bg-[var(--success)]',
            status === 'speaking' && 'bg-[var(--info)] animate-pulse',
            status === 'listening' && 'bg-[var(--success)] animate-pulse'
          )} />
          {status === 'idle' && 'Ready to connect'}
          {status === 'connecting' && 'Connecting...'}
          {status === 'connected' && 'Connected'}
          {status === 'speaking' && 'AI Speaking...'}
          {status === 'listening' && 'Listening...'}
        </div>

        {/* Main Button */}
        <div className="relative">
          {isConnected && (
            <div className={cn(
              'absolute -inset-2 rounded-full border-2 animate-pulse',
              status === 'listening' ? 'border-[var(--success)]' : 'border-[var(--info)]',
              'opacity-30'
            )} />
          )}

          <button
            onClick={isConnected ? disconnect : connect}
            className={cn(
              'relative p-6 rounded-full transition-all',
              isConnected
                ? 'bg-[var(--error)] hover:bg-[var(--error)]/90'
                : 'bg-[var(--primary)] hover:bg-[var(--primary-hover)]'
            )}
          >
            {isConnected ? (
              <PhoneOff className="h-8 w-8 text-white" />
            ) : (
              <Mic className="h-8 w-8 text-white" />
            )}
          </button>
        </div>

        {/* Controls */}
        {isConnected && (
          <div className="flex items-center gap-2">
            <button
              onClick={toggleMute}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all',
                isMuted
                  ? 'bg-[var(--error-bg)] text-[var(--error)]'
                  : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              )}
            >
              {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              {isMuted ? 'Unmute' : 'Mute'}
            </button>
            <button
              onClick={disconnect}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium bg-[var(--error-bg)] text-[var(--error)] hover:bg-[var(--error)]/10 transition-all"
            >
              <PhoneOff className="h-4 w-4" />
              End
            </button>
          </div>
        )}

        {/* Transcript */}
        {transcript && (
          <div className="w-full mt-2 p-3 rounded-md bg-[var(--bg-secondary)] border border-[var(--card-border)]">
            <p className="text-xs text-[var(--text-muted)] mb-1">AI Response:</p>
            <p className="text-sm text-[var(--text-primary)]">{transcript}</p>
          </div>
        )}

        {/* Instructions */}
        {!isConnected && (
          <div className="text-center">
            <p className="text-sm text-[var(--text-secondary)]">
              Click to start voice conversation
            </p>
            <p className="text-xs text-[var(--text-muted)] mt-1 max-w-xs">
              Ask questions about your documents using natural speech.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
