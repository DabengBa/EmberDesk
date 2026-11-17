// Only the body-parser API used by the server is declared here. Express's
// published declarations already expose these same body-parser function types.
declare module 'body-parser' {
    const bodyParser: Pick<typeof import('express'), 'json' | 'urlencoded'>;
    export default bodyParser;
}
