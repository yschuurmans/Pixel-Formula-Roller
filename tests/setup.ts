import '@testing-library/jest-dom'

// Shim Request to tolerate AbortSignal objects from mixed realms.
// React Router constructs a Request with a signal that can be rejected
// by Node/undici's webidl checks in the test environment. Catch that
// specific error and retry without the signal so tests don't fail.
const NativeRequest = (globalThis as any).Request
if (NativeRequest) {
	const SafeRequest = function (input: any, init?: any) {
		try {
			return new NativeRequest(input, init)
		} catch (err: any) {
			const msg = err && err.message
			if (typeof msg === 'string' && msg.includes('Expected signal')) {
				const { signal, ...rest } = init || {}
				return new NativeRequest(input, rest)
			}
			throw err
		}
	}

	SafeRequest.prototype = NativeRequest.prototype
	;(globalThis as any).Request = SafeRequest
}
