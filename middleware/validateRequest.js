import { z, ZodError } from "zod";

const validate = (schema) => (req, res, next) => {
  // 1. try: call schema.parse(req.body)
  try {
    schema.parse(req.body);
    // 2. if it passes, call next()
    next();
    // 3. catch error: if it's a ZodError, return 400 with error messages
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({
        status: "fail",
        message: error.issues.map((e) => e.message).join(", "),
      });
    }
    // 4. otherwise call next(error) to pass to global error handler
    next(error);
  }
};
export { validate };
