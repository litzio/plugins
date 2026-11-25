const mib = 1024 * 1024;

// The public saveDocument contract counts decoded image bytes and the UTF-8 request.
export function checkSaveSize(request) {
  const images = request.images || [];
  const bytes =
    images.reduce((sum, image) => sum + image.base64.length, 0) +
    new TextEncoder().encode(
      JSON.stringify({
        ...request,
        images: images.map((image) => ({ ...image, base64: "" })),
      }),
    ).length;
  const oversized = images.some(
    ({ base64 }) =>
      (base64.length / 4) * 3 - base64.match(/=*$/)[0].length > 10 * mib,
  );
  if (bytes > 32 * mib || images.length > 256 || oversized) {
    throw new Error(
      `그림을 포함한 문서를 저장할 수 없습니다(그림 ${images.length}장, 요청 약 ${(bytes / mib).toFixed(1)} MiB). 저장 한도는 그림당 10 MiB, 최대 256장, 요청 전체 32 MiB입니다.`,
    );
  }
}
