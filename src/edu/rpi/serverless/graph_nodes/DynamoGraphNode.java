package edu.rpi.serverless.graph_nodes;

import com.google.common.collect.Lists;
import edu.rpi.serverless.ServerlessGraphNode;

import java.util.Arrays;
import java.util.List;


public class DynamoGraphNode extends ServerlessGraphNode {

    public ArnTypes arn_type;
    public String data_center;
    public String account_id;
    public String table_name;
    private String _cached_name;

    public DynamoGraphNode(String arn) {
        //in the format: 'arn:aws:dynamodb:region:account-id:table/tablename(/stream/label?)'
        List<String> arn_fields = Lists.newArrayList(arn.split(":"));
        if (arn_fields.get(0).equals("arn")) arn_fields.remove(0);
        if (arn_fields.get(0).equals("aws")) arn_fields.remove(0);

        String api = arn_fields.remove(0);
        this.arn_type = ArnTypes.getByARN(api);
        this.data_center = arn_fields.remove(0);
        this.account_id = arn_fields.remove(0);
        this.table_name = arn_fields.remove(0).replace("table/", "").replace("/stream/label", "");
    }

    public DynamoGraphNode(String data_center, String account_id, String table_name) {
        this.arn_type = ArnTypes.DYNAMO;
        this.data_center = data_center;
        this.account_id = account_id;
        this.table_name = table_name;
    }

    @Override
    public String getName() {
        if (_cached_name == null) {
            _cached_name = String.format("arn:aws:%s:%s:%s:table/%s", this.arn_type.getArn_segment(), this.data_center, this.account_id, this.table_name);
        }
        return _cached_name;
    }

    @Override
    public ServerlessNodeType getType() {
        return ServerlessNodeType.DYNAMO_TABLE;
    }
}
