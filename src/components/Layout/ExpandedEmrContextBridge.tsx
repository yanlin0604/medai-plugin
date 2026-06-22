import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { activateEmrContext } from '../../services/emrContext/activateEmrContext';
import { watchEmrContext } from '../../services/emrContext/watchEmrContext';
import { getBubbleContextKey, useBubbleStore } from '../../stores/useBubbleStore';
import { usePatientStore } from '../../stores/usePatientStore';

export default function ExpandedEmrContextBridge() {
  const navigate = useNavigate();
  const location = useLocation();
  const setDetectedContext = useBubbleStore((state) => state.setDetectedContext);
  const markActivated = useBubbleStore((state) => state.markActivated);
  const selectPatient = usePatientStore((state) => state.selectPatient);
  const selectDoc = usePatientStore((state) => state.selectDoc);
  const lastContextKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const cleanup = watchEmrContext((context) => {
      setDetectedContext(context);
      if (!context) {
        lastContextKeyRef.current = null;
        return;
      }

      const contextKey = getBubbleContextKey(context);
      if (lastContextKeyRef.current === contextKey) return;

      const activation = activateEmrContext(context, selectPatient, selectDoc);
      if (!activation) return;

      lastContextKeyRef.current = contextKey;
      markActivated(contextKey);
      if (location.pathname === `/doc/${activation.docCode}`) return;
      navigate(`/doc/${activation.docCode}`);
    });

    return cleanup;
  }, [location.pathname, markActivated, navigate, selectDoc, selectPatient, setDetectedContext]);

  return null;
}
