import { useCallback, useEffect, useRef, useState } from "react";
import { draftService } from "../services/draftService";

type UseDraftResult = {
    draftText: string;
    setDraftText: (text: string) => void;
    clearDraft: () => Promise<void>;
    loaded: boolean;
};

export const useDraft = (conversationId?: string | null): UseDraftResult => {
    const [draftText, setDraftTextState] = useState("");
    const [loaded, setLoaded] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const remoteDeleteRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const conversationIdRef = useRef<string | null>(conversationId || null);

    useEffect(() => {
        conversationIdRef.current = conversationId || null;
    }, [conversationId]);

    useEffect(() => {
        let active = true;

        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
            debounceRef.current = null;
        }
        if (remoteDeleteRef.current) {
            clearTimeout(remoteDeleteRef.current);
            remoteDeleteRef.current = null;
        }

        if (!conversationId) {
            setDraftTextState("");
            setLoaded(true);
            return () => {
                active = false;
            };
        }

        setLoaded(false);
        draftService.getDraft(conversationId)
            .then((draft) => {
                if (active) {
                    setDraftTextState(draft?.text || "");
                    setLoaded(true);
                }
            })
            .catch(() => {
                if (active) {
                    setDraftTextState("");
                    setLoaded(true);
                }
            });

        return () => {
            active = false;
        };
    }, [conversationId]);

    useEffect(() => {
        return () => {
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
            }
            if (remoteDeleteRef.current) {
                clearTimeout(remoteDeleteRef.current);
            }
        };
    }, []);

    const syncRemoteDraft = useCallback((targetConversationId: string, text: string) => {
        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }

        debounceRef.current = setTimeout(() => {
            draftService.syncDraft(targetConversationId, text).catch(() => {
                // Local draft is the source of truth on mobile; remote sync is best-effort.
            });
        }, 1600);
    }, []);

    const deleteRemoteDraft = useCallback((targetConversationId: string) => {
        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
            debounceRef.current = null;
        }
        if (remoteDeleteRef.current) {
            clearTimeout(remoteDeleteRef.current);
        }

        remoteDeleteRef.current = setTimeout(() => {
            draftService.deleteRemoteDraft(targetConversationId).catch(() => {
                // Best-effort remote cleanup.
            });
        }, 250);
    }, []);

    const setDraftText = useCallback((text: string) => {
        const targetConversationId = conversationIdRef.current;
        setDraftTextState(text);

        if (!targetConversationId) return;

        if (!text.trim()) {
            draftService.deleteLocalDraft(targetConversationId).catch(() => { });
            deleteRemoteDraft(targetConversationId);
            return;
        }

        draftService.saveLocalDraft(targetConversationId, text).catch(() => { });
        syncRemoteDraft(targetConversationId, text);
    }, [deleteRemoteDraft, syncRemoteDraft]);

    const clearDraft = useCallback(async () => {
        const targetConversationId = conversationIdRef.current;
        setDraftTextState("");
        if (!targetConversationId) return;

        await draftService.deleteLocalDraft(targetConversationId);
        deleteRemoteDraft(targetConversationId);
    }, [deleteRemoteDraft]);

    return {
        draftText,
        setDraftText,
        clearDraft,
        loaded,
    };
};

export default useDraft;
