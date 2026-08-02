export function formatExitReason(code: number | null): string {
  return code === null ? '프로세스를 시작하지 못함' : `종료 코드 ${code}`;
}

export function formatActionResultMessage(label: string, code: number | null): string {
  return code === 0 ? `${label} 완료` : `${label} 실패 (${formatExitReason(code)})`;
}
