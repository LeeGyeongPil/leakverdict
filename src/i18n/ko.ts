// 한국어 메시지 표. 키 집합은 en.ts 와 같아야 한다(테스트로 확인).
import type { MessageKey } from './en.js';

export const ko: Record<MessageKey, string> = {
  'err.E_FILE_NOT_FOUND':
    '파일을 찾을 수 없습니다: {path}. 경로를 확인하고, 회전된 파일도 함께 넘기세요(예: mem.jsonl mem.jsonl.1).',
  'err.E_FILE_ACCESS':
    '{path} 을(를) 읽을 수 없습니다({reason}). 파일 권한을 확인하거나 읽을 수 있는 사용자로 실행하세요.',
  'err.E_IS_DIRECTORY':
    '{path} 은(는) 디렉터리입니다. 그 안의 JSONL 파일을 넘기세요(예: {path}/mem.jsonl).',
  'err.E_EMPTY_INPUT':
    '{path} 에 샘플이 없습니다. 샘플러를 먼저 실행해 최소 한 줄이 기록되게 하세요.',
  'err.E_PARSE':
    '{path}:{line}: JSON 형식이 잘못되었습니다({reason}). 한 줄에 JSON 객체 하나여야 합니다. 그 줄을 고치거나 지우세요.',
  'err.E_SCHEMA':
    "{where}: 행 형식이 잘못되었습니다. '{field}' 항목은 {expected} 이어야 합니다. README 의 데이터 형식(스키마 v1)을 확인하세요.",
  'err.E_BAD_OPTION': '{option} 값이 잘못되었습니다: "{value}". 기대하는 값: {expected}.',
  'err.E_UNKNOWN_OPTION': '알 수 없는 옵션 {option}. leakverdict --help 로 사용할 수 있는 옵션을 확인하세요.',
  'err.E_MISSING_VALUE': '{option} 옵션에 값이 필요합니다. 예: {option} <값> (leakverdict --help 참고).',
  'err.E_NO_FILES':
    '분석할 JSONL 파일을 하나 이상 주세요. 예: leakverdict analyze mem.jsonl (회전된 파일도 함께: mem.jsonl.1).',
  'err.E_UNKNOWN_SCENARIO': '알 수 없는 시나리오 "{name}". 다음 중에서 고르세요: {choices}.',
  'err.E_WRITE':
    '{path} 에 쓸 수 없습니다({reason}). 쓸 수 있는 위치를 고르거나(예: --out) 디렉터리 권한을 고치세요.',
  'err.E_SIMULATE_FAILED':
    '"{scenario}" 시뮬레이션 자식 프로세스가 실패했습니다({reason}). 다시 실행해 보고, 계속 실패하면 node --expose-gc 로 시나리오를 직접 실행해 오류를 확인하세요.',
  // 기대값 설명(E_BAD_OPTION, E_SCHEMA 에서 사용)
  'exp.positive-int': '양의 정수',
  'exp.int-min-3': '3 이상의 정수',
  'exp.number-min-0': '0 이상의 수',
  'exp.number-min-1': '1 이상의 수',
  'exp.number-0-1': '0 이상 1 이하의 수',
  'exp.pid': '프로세스 ID(양의 정수)',
  'exp.pid-in-input': '입력에 있는 pid 중 하나({list})',
  'exp.command': 'analyze 또는 simulate',
  'exp.format': '{list} 중 하나',
  'exp.fail-on': 'any 또는 쉼표로 구분한 목록({list})',
  'exp.lang': 'en 또는 ko',
  'exp.int-3-1000': '3 이상 1000 이하의 정수',
  'exp.int-1-60000': '1 이상 60000 이하의 정수',
  'exp.non-empty-path': '비어 있지 않은 경로',
  'exp.name-and-number': '비어 있지 않은 이름과 유한한 수',
  'exp.json-object': 'JSON 객체',
  'exp.one': '숫자 1',
  'exp.epoch-ms': '숫자(epoch ms)',
  'exp.non-negative-int': '0 이상의 정수',
  'exp.non-empty-string': '비어 있지 않은 문자열',
  'exp.bytes': '0 이상의 수(바이트)',
  'exp.object-of-numbers': '숫자로 이루어진 객체',
  'exp.non-negative-number': '0 이상의 수',
  'err.unexpected': '예상하지 못한 오류: {message}',
  'cli.errorPrefix': 'leakverdict: 오류:',

  'warn.W_MULTIPLE_PIDS':
    '입력에 여러 프로세스(pid {pids})가 섞여 있어 마지막 것({used})만 분석합니다. 다른 것은 --pid 로 고르세요.',
  'warn.W_MIXED_NODE':
    '입력에 여러 Node 버전({versions})이 섞여 있습니다. 버전마다 증가 양상이 다를 수 있습니다.',

  'kind.js-heap': 'JS 객체가 V8 힙에 계속 쌓이고 있습니다',
  'kind.native-buffer': '네이티브 메모리(Buffer/ArrayBuffer)가 V8 힙 밖에서 계속 늘고 있습니다',
  'kind.handles': '활성 핸들(타이머·소켓·요청)이 해제되지 않고 쌓이고 있습니다',
  'kind.allocator-retention': '메모리가 OS 로 돌아가지 않습니다(할당기 미반환 의심)',
  'kind.none': '지속적인 증가가 보이지 않습니다',
  'kind.insufficient-data': '판정하기에 데이터가 부족합니다',
  'conf.high': '높음',
  'conf.medium': '중간',
  'conf.low': '낮음',
  'conf.suspected': '의심',
  'next.heap-snapshot':
    '몇 분 간격으로 힙 스냅샷을 떠서 비교하세요(예: memlab, Chrome DevTools). 무엇이 객체를 붙잡고 있는지 찾을 수 있습니다.',
  'next.buffer-retention':
    'Buffer 를 붙잡고 있는 곳(캐시·큐·소비되지 않는 스트림)을 찾고 스트림 백프레셔를 확인하세요.',
  'next.why-is-node-running':
    '이벤트 루프를 붙잡고 있는 것을 확인하고(예: why-is-node-running) 해제되지 않는 타이머·소켓·요청을 닫으세요.',
  'next.allocator-ab':
    '애플리케이션 누수가 아닐 수 있습니다. 코드를 고치기 전에 같은 부하를 다른 할당기(예: jemalloc)나 다른 Node 버전으로 돌려 비교하세요.',
  'next.collect-longer':
    '샘플러를 더 오래 돌려(최소 {needed}개, 가능하면 몇 시간) 다시 분석하세요.',

  'ev.grew.bytes':
    '{metric}: {from} MB -> {to} MB ({delta} MB), 기울기 {slope} MB/시간, R2 {r2}',
  'ev.grew.count': '{metric}: {from} -> {to} ({delta}), 기울기 {slope}/시간, R2 {r2}',
  'ev.flat.bytes': '{metric}: {from} MB -> {to} MB ({delta} MB), 지속적인 증가 없음',
  'ev.flat.count': '{metric}: {from} -> {to} ({delta}), 지속적인 증가 없음',
  'ev.stepSuffix': '가장 큰 단일 점프 +{size} MB',

  'report.title': 'leakverdict 보고서',
  'report.span': '샘플: {samples}개, {minutes}분 ({from} .. {to}), pid {pid}, Node {node}',
  'report.next': '다음 단계',
  'report.warnings': '경고',
  'report.insufficient': '사용 가능한 샘플이 {samples}개뿐입니다(최소 {needed}개 필요).',
  'md.col.verdict': '판정',
  'md.col.confidence': '신뢰도',
  'md.col.evidence': '근거',
  'md.col.next': '다음 단계',

  'cli.help': `leakverdict {version} - Node.js 메모리 증가가 어떤 종류인지 판정합니다

사용법:
  leakverdict analyze <파일...> [옵션]       JSONL 지표 로그 분석(회전된 파일 포함)
  leakverdict simulate <시나리오> [옵션]     메모리를 실제로 키우는 자식 Node 프로세스를 돌린 뒤 분석

시나리오: {scenarios}

옵션:
  --format <text|md|json>   보고서 형식(기본: text)
  --fail-on <종류|any>      해당 판정이 나오면 종료 코드 1
                            (쉼표 구분: {kinds};
                            "any" = none·insufficient-data 를 뺀 모든 판정)
  --lang <en|ko>            메시지 언어(기본: LEAKVERDICT_LANG, LC_ALL, LC_MESSAGES, LANG 순)
  --pid <n>                 입력에 프로세스가 여러 개일 때 분석할 pid
  --min-samples <n>         판정에 필요한 최소 행 수(기본 6)
  --min-growth-mb <n>       최소 절대 증가량 MB(기본 5)
  --min-rel-growth <n>      시작 수준 대비 최소 증가 비율, 0.1 = 10%(기본 0.1; 큰 힙이면 낮추세요.
                            --min-growth-mb 만 주면 이 값은 0 이 됩니다)
  --min-r2 <0..1>           추세 적합도 최솟값(기본 0.5)
  --out <파일>              simulate: 기록된 JSONL 을 이 파일에 남김
  --steps <n>               simulate: 증가 단계 수(기본 10)
  --interval-ms <n>         simulate: 단계 사이 대기 ms(기본 50)
  -h, --help                도움말
  -v, --version             버전

종료 코드: 0 정상, 1 --fail-on 판정 발견, 2 입력·옵션 오류.`,
};
