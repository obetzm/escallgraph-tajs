package edu.rpi.serverless.yaml_model;

import edu.rpi.serverless.graph_nodes.LambdaGraphNode;
import org.yaml.snakeyaml.Yaml;
import org.yaml.snakeyaml.representer.Representer;
import sun.reflect.generics.reflectiveObjects.NotImplementedException;

import java.io.*;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.Map;
import java.util.stream.Stream;

public class ServerlessFile {


    public ServerlessFile() {}

    public Path file_location;
    public String service;
    public Map<String, ServerlessFunctionDefinition> functions;

    public static class ServerlessFunctionDefinition {
        public ServerlessFunctionDefinition() {
        }

        public ServerlessFile declared_file;
        public String name;
        public String handler;
        public Map<String, String> environment;
        public Collection<ServerlessFunctionTrigger> events;

        public String get_fully_qualified_name() {
            return LambdaGraphNode.buildFullNameFromParts(this.declared_file.service, "dev", this.name);
        }
    }

    public static class ServerlessFunctionTrigger {
        public ServerlessFunctionTrigger() {
        }

        public ServerlessHTTPTrigger http;
        public ServerlessStreamTrigger stream;
        public String schedule;
        public ServerlessS3Trigger s3;
        public ServerlessSQSTrigger sqs;
    }

    public static class ServerlessHTTPTrigger {
        public ServerlessHTTPTrigger() { }

        public String path;
        public String method;
        public boolean cors;
    }

    public static class ServerlessStreamTrigger {
        public ServerlessStreamTrigger() {
        }

        public String arn;
        public boolean enabled;
        public String startingPosition;
    }

    public static class ServerlessS3Trigger {
        public ServerlessS3Trigger() {}

        public String bucket;
        public String event;
    }

    public static class ServerlessSQSTrigger {
        public ServerlessSQSTrigger() {}

        public String arn;
    }

    public static ServerlessFile from(CloudFormationFile cf_file) {

        ServerlessFile ret = new ServerlessFile();
        ret.file_location = cf_file.file_location;
        ret.service = "app";
        ret.functions = new HashMap<>();
        Stream<Map.Entry<String, CloudFormationFile.CFResourceDefinition>> cf_functions = cf_file.Resources
                .entrySet()
                .stream()
                .filter((entry) -> entry.getValue().Type.equals("AWS::Serverless::Function"));

        cf_functions.forEach((e) -> {
            ServerlessFunctionDefinition new_val = new ServerlessFunctionDefinition();
            new_val.name = e.getKey();
            new_val.handler = e.getValue().Properties.Handler;
            new_val.events = new ArrayList<>();
            if (e.getValue().Properties.Events != null) {
                e.getValue().Properties.Events.forEach((ename, eval) -> {
                    ServerlessFunctionTrigger new_ev = new ServerlessFunctionTrigger();
                    switch (eval.Type) {
                        case "Api":
                            new_ev.http = new ServerlessHTTPTrigger();
                            new_ev.http.method = eval.Properties.Method;
                            new_ev.http.path = eval.Properties.Path;
                            break;
                        case "Schedule":
                            new_ev.schedule = (eval.Properties.Schedule != null) ? eval.Properties.Schedule : eval.Properties.Rate; //todo: cron() or rate()
                            break;
                        case "S3":
                            new_ev.s3 = new ServerlessS3Trigger();
                            new_ev.s3.bucket = eval.Properties.Bucket;
                            new_ev.s3.event = eval.Properties.Events;
                            break;
                        case "SQS":
                            new_ev.sqs = new ServerlessSQSTrigger();
                            new_ev.sqs.arn = eval.Properties.Queue;
                            break;
                        default:
                            throw new NotImplementedException();
                    }
                    new_val.events.add(new_ev);
                });
            }
            ret.functions.put(e.getKey(), new_val);
        });

        return ret;
    }



    public static ServerlessFile parse(Path path) {
        Representer opts = new Representer();
        opts.getPropertyUtils().setSkipMissingProperties(true);
        Yaml parser = new Yaml(opts);

        ServerlessFile doc = null;

        File serverless_file = path.toFile();
        try {
            InputStream serverless_stream = new DataInputStream(new FileInputStream(serverless_file));
            doc = parser.loadAs(serverless_stream, ServerlessFile.class);
            doc.file_location =  serverless_file.toPath();
        }
        catch (FileNotFoundException e) {
            System.out.println("WARNING: could not find serverless file : " + path);
        }
        return doc;
    }
}
