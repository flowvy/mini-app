import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";

type BackHandler = () => void;

interface BackNavigationContextValue {
	consumeBack: () => boolean;
	hasBackHandler: boolean;
	registerBackHandler: (handler: BackHandler) => () => void;
}

const BackNavigationContext = createContext<BackNavigationContextValue | null>(null);

export function BackNavigationProvider({ children }: { children: ReactNode }) {
	const handlersRef = useRef<Array<{ id: symbol; handler: BackHandler }>>([]);
	const [handlerCount, setHandlerCount] = useState(0);

	const registerBackHandler = useCallback((handler: BackHandler) => {
		const entry = { id: Symbol("back-handler"), handler };
		handlersRef.current.push(entry);
		setHandlerCount((count) => count + 1);
		let registered = true;

		return () => {
			if (!registered) return;
			registered = false;
			handlersRef.current = handlersRef.current.filter((candidate) => candidate.id !== entry.id);
			setHandlerCount((count) => Math.max(0, count - 1));
		};
	}, []);

	const consumeBack = useCallback(() => {
		const entry = handlersRef.current.at(-1);
		if (!entry) return false;
		entry.handler();
		return true;
	}, []);

	const value = useMemo(
		() => ({ consumeBack, hasBackHandler: handlerCount > 0, registerBackHandler }),
		[consumeBack, handlerCount, registerBackHandler],
	);

	return <BackNavigationContext.Provider value={value}>{children}</BackNavigationContext.Provider>;
}

function useBackNavigationContext(): BackNavigationContextValue {
	const context = useContext(BackNavigationContext);
	if (!context) throw new Error("Back navigation must be used inside BackNavigationProvider");
	return context;
}

export function useBackNavigationController(): Pick<
	BackNavigationContextValue,
	"consumeBack" | "hasBackHandler"
> {
	const { consumeBack, hasBackHandler } = useBackNavigationContext();
	return { consumeBack, hasBackHandler };
}

export function useBackNavigationHandler(handler: BackHandler, active = true): void {
	const { registerBackHandler } = useBackNavigationContext();
	const handlerRef = useRef(handler);
	handlerRef.current = handler;

	useLayoutEffect(() => {
		if (!active) return;
		return registerBackHandler(() => handlerRef.current());
	}, [active, registerBackHandler]);
}
